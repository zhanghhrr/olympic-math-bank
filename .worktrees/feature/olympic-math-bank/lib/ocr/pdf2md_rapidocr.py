#!/usr/bin/env python3
"""
PDF → 图片 → docling(RapidOCR mobile) → Markdown / JSON 转换脚本

将 PDF 先渲染为图片（解决 PDF 内嵌字体/矢量数字无法被 text layer 提取的问题），
再通过 docling 版面分析 + RapidOCR mobile 模型进行 OCR 识别，输出 Markdown 或 JSON。

用法:
    # 基本用法，输出 md 与 PDF 同目录同名
    python lib/ocr/pdf2md_rapidocr.py input.pdf

    # 输出 JSON（含 bbox 坐标、页面信息等结构化数据）
    python lib/ocr/pdf2md_rapidocr.py input.pdf --format json

    # 同时输出 md 和 json
    python lib/ocr/pdf2md_rapidocr.py input.pdf --format md,json

    # 指定输出目录
    python lib/ocr/pdf2md_rapidocr.py input.pdf -o output/

    # 指定 DPI（默认 300）
    python lib/ocr/pdf2md_rapidocr.py input.pdf --dpi 200

依赖:
    pip install docling PyMuPDF rapidocr
"""

import json
import os
import sys
import time
from pathlib import Path

import fitz
import numpy as np
from PIL import Image
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    RapidOcrOptions,
)
from docling.document_converter import DocumentConverter, ImageFormatOption


def find_rapidocr_models_dir() -> Path:
    import rapidocr

    pkg_dir = Path(rapidocr.__file__).parent
    models_dir = pkg_dir / "models"
    if not models_dir.is_dir():
        raise FileNotFoundError(
            f"RapidOCR models 目录未找到: {models_dir}\n"
            "请确保 rapidocr 已正确安装: pip install rapidocr"
        )
    return models_dir


def pdf_to_images(pdf_path: Path, image_dir: Path, dpi: int = 300) -> list[Path]:
    image_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    image_paths = []

    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=dpi)
        img_path = image_dir / f"page_{i + 1:02d}.png"
        pix.save(str(img_path))
        image_paths.append(img_path)
        print(f"  第 {i + 1}/{len(doc)} 页: {img_path.name} ({pix.width}x{pix.height})")

    doc.close()
    return image_paths


def enhance_underlines(image_path: Path) -> None:
    """
    预处理图片: 检测并加粗细水平线（下划线/填空线），解决 OCR 无法识别细线的问题

    原理:
    1. 对图片做垂直方向模糊 → 得到"不含水平线"的参考图
    2. 原图 - 参考图 → 突出水平细线区域
    3. 将检测到的细线区域上下扩展 1px → 线变粗，OCR 可识别为 _
    """
    img = Image.open(image_path).convert("L")
    arr = np.array(img, dtype=np.float32)

    is_dark_text = np.median(arr) > 128
    if is_dark_text:
        arr = 255 - arr  # 反转: 深色=文字/线条

    vert_blur = np.copy(arr)
    for offset in [-2, -1, 1, 2]:
        src = arr[2 + offset : arr.shape[0] - 2 + offset] if offset > 0 else arr[2 + offset : arr.shape[0] + offset]
        dst = vert_blur[2 : vert_blur.shape[0] - 2]
        min_len = min(len(src), len(dst))
        dst[:min_len] += src[:min_len]
    vert_blur[2:-2] /= 5

    h_line_score = arr - vert_blur
    is_thin_line = (arr > 40) & (h_line_score > 18)

    thickened = arr.copy()
    thickened[is_thin_line] = 255

    for offset in [-1, 1]:
        shifted = np.roll(is_thin_line, offset, axis=0)
        thickened[shifted] = 255

    if is_dark_text:
        thickened = 255 - thickened

    enhanced = Image.fromarray(thickened.astype(np.uint8))
    enhanced.save(image_path)


def build_converter(model_type: str = "mobile") -> DocumentConverter:
    models_dir = find_rapidocr_models_dir()

    det_model = f"ch_PP-OCRv4_det_{model_type}.onnx"
    rec_model = f"ch_PP-OCRv4_rec_{model_type}.onnx"

    det_path = models_dir / det_model
    rec_path = models_dir / rec_model

    if not det_path.exists():
        raise FileNotFoundError(f"检测模型未找到: {det_path}")
    if not rec_path.exists():
        raise FileNotFoundError(f"识别模型未找到: {rec_path}")

    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = True
    pipeline_options.do_table_structure = True
    pipeline_options.table_structure_options.do_cell_matching = True
    pipeline_options.do_formula_enrichment = True

    pipeline_options.ocr_options = RapidOcrOptions(
        det_model_path=str(det_path),
        rec_model_path=str(rec_path),
        force_full_page_ocr=True,
    )

    print(f"  OCR 引擎: RapidOCR ({model_type})")
    print(f"  检测模型: {det_path.name}")
    print(f"  识别模型: {rec_path.name}")

    return DocumentConverter(
        format_options={
            InputFormat.IMAGE: ImageFormatOption(
                pipeline_options=pipeline_options,
            )
        }
    )


def convert_pdf(
    pdf_path: str | Path,
    model_type: str = "mobile",
    dpi: int = 300,
    keep_images: bool = False,
    enhance_lines: bool = True,
) -> dict:
    """
    转换 PDF，返回结构化结果

    Returns:
        {
            "pdf_path": Path,
            "markdown": str,
            "json": dict,
            "image_paths": list[Path],
            "elapsed": float,
        }
    """
    pdf_path = Path(pdf_path).resolve()
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF 文件不存在: {pdf_path}")
    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError(f"仅支持 PDF 文件: {pdf_path}")

    image_dir = pdf_path.parent / f".pdf2md_tmp_{pdf_path.stem}"

    print(f"\n[PDF] 转换 (RapidOCR {model_type}, {dpi} DPI)")
    print(f"  输入: {pdf_path}")

    print(f"\n🔍 第 1 步: PDF → 图片")
    image_paths = pdf_to_images(pdf_path, image_dir, dpi=dpi)

    print(f"\n🔍 第 1.5 步: 预处理 → 水平线增强")
    if enhance_lines:
        for ip in image_paths:
            enhance_underlines(ip)
        print(f"  已增强 {len(image_paths)} 张图片的水平线")
    else:
        print(f"  已跳过（--no-enhance）")

    print(f"\n🔍 第 2 步: 图片 → OCR 识别")
    converter = build_converter(model_type=model_type)

    all_md_parts = []
    all_dicts = []
    total_start = time.time()

    for i, img_path in enumerate(image_paths):
        page_start = time.time()
        print(f"  识别第 {i + 1}/{len(image_paths)} 页...", end=" ", flush=True)
        result = converter.convert(str(img_path))

        md = result.document.export_to_markdown()
        all_md_parts.append(md)

        page_dict = result.document.export_to_dict()
        all_dicts.append(page_dict)

        elapsed = time.time() - page_start
        print(f"完成 ({elapsed:.1f}s, {len(md)} 字符)")

    total_elapsed = time.time() - total_start
    print(f"  总耗时: {total_elapsed:.1f}s (平均 {total_elapsed / len(image_paths):.1f}s/页)")

    merged_md = "\n\n---\n\n".join(all_md_parts)

    merged_json = {
        "source": str(pdf_path),
        "model": model_type,
        "dpi": dpi,
        "pages": len(all_dicts),
        "elapsed_seconds": round(total_elapsed, 1),
        "page_results": all_dicts,
    }

    if not keep_images:
        for p in image_paths:
            p.unlink(missing_ok=True)
        try:
            image_dir.rmdir()
        except OSError:
            pass
        print("  已清理中间图片")

    return {
        "pdf_path": pdf_path,
        "markdown": merged_md,
        "json": merged_json,
        "image_paths": image_paths,
        "elapsed": total_elapsed,
    }


def write_output(result: dict, output_base: Path, formats: list[str]) -> list[Path]:
    output_files = []

    if "md" in formats:
        md_path = output_base.with_suffix(".md")
        md_path.write_text(result["markdown"], encoding="utf-8")
        output_files.append(md_path)
        print(f"  Markdown: {md_path}")

    if "json" in formats:
        json_path = output_base.with_suffix(".json")
        json_path.write_text(
            json.dumps(result["json"], indent=2, ensure_ascii=False, default=str),
            encoding="utf-8",
        )
        output_files.append(json_path)
        print(f"  JSON: {json_path}")

    return output_files


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="PDF → 图片 → RapidOCR → Markdown / JSON 转换工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python lib/ocr/pdf2md_rapidocr.py input.pdf
  python lib/ocr/pdf2md_rapidocr.py input.pdf --format json
  python lib/ocr/pdf2md_rapidocr.py input.pdf --format md,json
  python lib/ocr/pdf2md_rapidocr.py input.pdf -o output/
  python lib/ocr/pdf2md_rapidocr.py input.pdf --dpi 200
        """,
    )
    parser.add_argument("pdf", help="PDF 文件路径")
    parser.add_argument(
        "-o", "--output",
        default=None,
        help="输出路径（文件或目录），默认与 PDF 同目录同名",
    )
    parser.add_argument(
        "--format",
        default="md",
        help='输出格式: md, json, md,json (默认: md)',
    )
    parser.add_argument(
        "--model",
        choices=["mobile", "server"],
        default="mobile",
        help="OCR 模型: mobile(默认,轻量快速) / server(高精度,模型较大)",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=400,
        help="渲染 DPI (默认: 400，越高细节越清晰但越慢)",
    )
    parser.add_argument(
        "--keep-images",
        action="store_true",
        default=False,
        help="保留中间生成的 PNG 图片",
    )
    parser.add_argument(
        "--no-enhance",
        action="store_true",
        default=False,
        help="跳过水平线增强预处理（下划线/填空线可能无法识别）",
    )

    args = parser.parse_args()

    formats = [f.strip() for f in args.format.split(",")]
    for f in formats:
        if f not in ("md", "json"):
            print(f"[ERROR] 不支持的格式: {f}，可选: md, json", file=sys.stderr)
            sys.exit(1)

    try:
        result = convert_pdf(
            pdf_path=args.pdf,
            model_type=args.model,
            dpi=args.dpi,
            keep_images=args.keep_images,
            enhance_lines=not args.no_enhance,
        )

        if args.output:
            output = Path(args.output).resolve()
            if output.suffix:
                output_base = output.parent / output.stem
            else:
                output.mkdir(parents=True, exist_ok=True)
                output_base = output / result["pdf_path"].stem
        else:
            output_base = result["pdf_path"].with_suffix("")

        output_files = write_output(result, output_base, formats)
        print(f"\n[OK] 完成: {len(output_files)} 个文件")

    except Exception as e:
        print(f"\n❌ 错误: {e}", file=sys.stderr)
        sys.exit(1)
