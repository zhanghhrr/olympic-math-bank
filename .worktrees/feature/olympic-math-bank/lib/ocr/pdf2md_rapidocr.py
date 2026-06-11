#!/usr/bin/env python3
"""
RapidOCR PDF → Markdown 识别脚本 (备用链路)
=============================================
当 MinerU API 不可用或额度耗尽时，启用本地 RapidOCR 兜底方案。

流程:
  1. 将 PDF 逐页转为图片 (pdf2image / poppler)
  2. 对每页图片执行 RapidOCR 文字识别
  3. 输出结构化 JSON 到 stdout:
     {
       "success": true,
       "pages": N,
       "blocks": [{ "type": "text", "text": "...", "bbox": [x0,y0,x1,y1], "pageIdx": 0 }],
       "formulas": [{ "latex": "...", "bbox": [x0,y0,x1,y1], "page": 0 }],
       "mdContent": "...markdown..."
     }

依赖:
  pip install rapidocr-onnxruntime pdf2image pillow

注意:
  - RapidOCR 对数学公式的识别精度有限，公式块建议走 MinerU 主链路
  - 本脚本专注于文字层识别，作为系统可用性兜底
"""

import sys
import os
import json
import argparse
import base64
import io
import traceback

# ---- 依赖检测 ----
MISSING_DEPS = []
try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:
    MISSING_DEPS.append("rapidocr-onnxruntime (pip install rapidocr-onnxruntime)")

try:
    from pdf2image import convert_from_path
except ImportError:
    MISSING_DEPS.append("pdf2image (pip install pdf2image)")

try:
    from PIL import Image
except ImportError:
    MISSING_DEPS.append("Pillow (pip install pillow)")


def output_error(msg: str):
    """输出统一的错误 JSON"""
    print(json.dumps({"success": False, "error": msg}, ensure_ascii=False))
    sys.exit(1)


def pdf_to_images(pdf_path: str, dpi: int = 200):
    """将 PDF 逐页转为 PIL Image 列表"""
    try:
        images = convert_from_path(pdf_path, dpi=dpi)
        if not images:
            output_error("PDF 转换后无图片页")
        return images
    except Exception as e:
        output_error(f"PDF 转图片失败: {str(e)}")


def run_ocr_on_images(images: list, ocr_engine) -> list:
    """
    对图片列表执行 OCR，返回 ContentBlock 列表
    格式与 MinerU client 兼容:
      { "type": "text", "text": "...", "bbox": [x0,y0,x1,y1], "pageIdx": N }
    """
    blocks = []
    for page_idx, img in enumerate(images):
        # RapidOCR 返回: (boxes, txts, scores)
        result = ocr_engine(img)
        if result is None:
            continue

        boxes = result[0] if result[0] else []
        txts = result[1] if len(result) > 1 and result[1] else []

        # 按 y 坐标排序，同行的合并 (简单行聚合)
        if boxes and txts:
            line_map = {}  # y_bucket -> list of (x0, text)
            for box, text in zip(boxes, txts):
                if not text or not isinstance(text, str):
                    continue
                # box: [[x0,y0],[x1,y0],[x1,y1],[x0,y1]]
                x0, y0 = box[0][0], box[0][1]
                x1, y1 = box[2][0], box[2][1]
                # 取 y 中位数作为行分组键 (容差 8px)
                y_center = (y0 + y1) / 2
                bucket = int(y_center // 8)
                if bucket not in line_map:
                    line_map[bucket] = []
                line_map[bucket].append((x0, text, x1, y0, y1))

            # 桶内按 x 排序，拼接同行文本
            for bucket, items in sorted(line_map.items()):
                items.sort(key=lambda it: it[0])
                line_text = " ".join(it[1] for it in items)
                x_min = min(it[0] for it in items)
                y_min = min(it[3] for it in items)
                x_max = max(it[2] for it in items)
                y_max = max(it[4] for it in items)
                blocks.append({
                    "type": "text",
                    "text": line_text.strip(),
                    "bbox": [x_min, y_min, x_max, y_max],
                    "pageIdx": page_idx,
                })

    return blocks


def blocks_to_markdown(blocks: list) -> str:
    """将 ContentBlock 列表拼装为 Markdown"""
    md_lines = []
    last_page = -1
    for b in blocks:
        if b["pageIdx"] != last_page:
            last_page = b["pageIdx"]
            md_lines.append(f"\n<!-- page {last_page + 1} -->\n")
        md_lines.append(b.get("text", ""))
    return "\n".join(md_lines)


def main():
    parser = argparse.ArgumentParser(description="RapidOCR PDF → Markdown 备用链路")
    parser.add_argument("pdf_path", help="PDF 文件路径")
    parser.add_argument("--dpi", type=int, default=200, help="图片转换 DPI (默认 200)")
    args = parser.parse_args()

    pdf_path = args.pdf_path

    if not os.path.exists(pdf_path):
        output_error(f"文件不存在: {pdf_path}")

    if MISSING_DEPS:
        output_error("缺少 Python 依赖: " + "; ".join(MISSING_DEPS))

    # 初始化 OCR 引擎
    try:
        ocr = RapidOCR()
    except Exception as e:
        output_error(f"RapidOCR 初始化失败: {str(e)}")

    # PDF → 图片
    images = pdf_to_images(pdf_path, dpi=args.dpi)

    # OCR 识别
    blocks = run_ocr_on_images(images, ocr)

    # 生成 Markdown
    md_content = blocks_to_markdown(blocks)

    # 输出结果
    result = {
        "success": True,
        "pages": len(images),
        "blocks": blocks,
        "formulas": [],  # RapidOCR 不提取公式，公式块为空
        "mdContent": md_content,
    }

    # 输出 JSON 到 stdout (Node.js 端通过 stdout 解析)
    print(json.dumps(result, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
