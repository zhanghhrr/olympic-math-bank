import os
import json
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

pdf_path = r"uploads\ocr\1775716099743-4S春4 多人相遇与追及 小测(教师版).pdf"

pipeline_options = PdfPipelineOptions()
pipeline_options.do_ocr = True
pipeline_options.do_table_structure = True
pipeline_options.table_structure_options.do_cell_matching = True
pipeline_options.do_formula_enrichment = True

converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(
            pipeline_options=pipeline_options,
        )
    }
)

result = converter.convert(pdf_path)

print("=== PDF 基本信息 ===")
print(f"页数: {len(result.document.pages) if result.document.pages else 0}")
print()

md_output = result.document.export_to_markdown()

output_base = r"test-output\docling_test_formula"
os.makedirs("test-output", exist_ok=True)
with open(f"{output_base}.md", "w", encoding="utf-8") as f:
    f.write(md_output)

print(f"Markdown 已输出到: {output_base}.md")
print(f"\n=== Markdown 内容预览 (前 5000 字符) ===")
print(md_output[:5000])
