import io
import fitz
from PIL import Image
import requests
from tqdm import tqdm
import json
import sys

UAT = "g9JLplG9QakhLJmRNP1o5XGF1dRDEUZGRDKKJC7KHFHlOKnsmAxZgIzCrhcgo8sk"

def pillow_image_to_file_binary(image):
    btyes_io = io.BytesIO()
    image.save(btyes_io, format='PNG')
    return btyes_io.getvalue()

def convert_pdf_to_images(pdf_binary, dpi=100):
    print(f"Opening PDF...")
    doc = fitz.open("pdf", pdf_binary)
    images = []
    page_count = min(doc.page_count, 1) # Just 1 page for quick test
    for i in range(page_count):
        page = doc[i]
        image = page.get_pixmap(dpi=dpi)
        image = Image.frombytes("RGB", [image.width, image.height], image.samples)
        images.append(image)
    return images

def pdf_ocr(image):
    api_url = "https://server.simpletex.cn/api/doc_ocr"
    header = {"token": UAT}
    img_binary = pillow_image_to_file_binary(image)
    print(f"Image size: {len(img_binary) / 1024:.2f} KB")
    img_file = {"file": pillow_image_to_file_binary(image)}
    try:
        res = requests.post(api_url, files=img_file, data={}, headers=header).json()
        if res.get("status"):
            return res["res"].get("latex", res["res"].get("content", str(res)))
        else:
            print(f"OCR Error: {res}")
            return f"<!-- OCR Error: {res} -->\n"
    except Exception as e:
        print(f"Request Error: {e}")
        return f"<!-- Request Error: {e} -->\n"

if __name__ == '__main__':
    pdf_path = r"C:\Users\Twilight\Desktop\【26春季】三年级第十二周刷题课(教师版).pdf"
    
    try:
        with open(pdf_path, 'rb') as f:
            file_binary = f.read()
    except Exception as e:
        print(f"Cannot open PDF: {e}")
        sys.exit(1)

    images = convert_pdf_to_images(file_binary)
    final_markdown_content = ""
    for idx, image in enumerate(tqdm(images)):
        print(f"\nProcessing page {idx+1}...")
        markdown_text = pdf_ocr(image)
        final_markdown_content += markdown_text + "\n\n---\n\n"
        print(markdown_text[:200])

    out_path = "simpletex-test-output.md"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(final_markdown_content)
    
    print(f"\nFinished! Results saved to {out_path}")
