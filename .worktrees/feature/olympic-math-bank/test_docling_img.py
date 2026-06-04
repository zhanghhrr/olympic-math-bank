import os
import fitz
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    RapidOcrOptions,
)
from docling.document_converter import DocumentConverter, ImageFormatOption

pdf_path = r"uploads\ocr\1775716099743-4S春4 多人相遇与追及 小测(教师版).pdf"
image_dir = r"test-output\docling_images"
os.makedirs(image_dir, exist_ok=True)

doc = fitz.open(pdf_path)
image_paths = []
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=300)
    img_path = os.path.join(image_dir, f"page_{i+1:02d}.png")
    pix.save(img_path)
    image_paths.append(img_path)
    print(f"Page {i+1} saved: {img_path} ({pix.width}x{pix.height})")
doc.close()

pipeline_options = PdfPipelineOptions()
pipeline_options.do_ocr = True
pipeline_options.do_table_structure = True
pipeline_options.table_structure_options.do_cell_matching = True
pipeline_options.do_formula_enrichment = True

# Set server models for higher accuracy
models_dir = r"C:\Users\Twilight\AppData\Local\Programs\Python\Python311\Lib\site-packages\rapidocr\models"
pipeline_options.ocr_options = RapidOcrOptions(
    rec_model_path=os.path.join(models_dir, "ch_PP-OCRv4_rec_server.onnx"),
    det_model_path=os.path.join(models_dir, "ch_PP-OCRv4_det_server.onnx"),
    force_full_page_ocr=True,
)
print(f"OCR: RapidOCR server models")
print(f"  det: {pipeline_options.ocr_options.det_model_path}")
print(f"  rec: {pipeline_options.ocr_options.rec_model_path}")

converter = DocumentConverter(
    format_options={
        InputFormat.IMAGE: ImageFormatOption(
            pipeline_options=pipeline_options,
        )
    }
)

all_md_parts = []
for i, img_path in enumerate(image_paths):
    print(f"\nProcessing page {i+1}...")
    result = converter.convert(img_path)
    md = result.document.export_to_markdown()
    all_md_parts.append(md)
    print(f"  Page {i+1} done, {len(md)} chars")

md_output = "\n\n---\n\n".join(all_md_parts)

output_base = r"test-output\docling_test_img2md_server"
with open(f"{output_base}.md", "w", encoding="utf-8") as f:
    f.write(md_output)

print(f"\nMarkdown 已输出到: {output_base}.md")
print(f"\n=== Markdown 内容预览 (前 5000 字符) ===")
print(md_output[:5000])
