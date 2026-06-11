"""
批量将 .wmf 文件转换为 .png

用法: python scripts/convert_wmf_to_png.py <input_dir>
  递归扫描 <input_dir> 下所有 .wmf 文件，在同目录生成同名 .png

依赖: pip install Pillow
  在 Windows 上 Pillow 通过 GDI API 支持 .wmf 解码
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("[ERROR] 需要安装 Pillow: pip install Pillow")
    sys.exit(1)

def convert_wmf_to_png(wmf_path: Path) -> bool:
    """将单个 .wmf 文件转换为 .png，成功返回 True"""
    png_path = wmf_path.with_suffix('.png')
    
    # 如果 PNG 已存在且比 WMF 新，跳过
    if png_path.exists() and png_path.stat().st_mtime >= wmf_path.stat().st_mtime:
        return True

    try:
        with Image.open(str(wmf_path)) as img:
            # 转换为 RGBA 模式（支持透明背景）
            if img.mode not in ('RGB', 'RGBA'):
                img = img.convert('RGBA')
            img.save(str(png_path), 'PNG')
        return True
    except Exception as e:
        print(f"  [FAIL] {wmf_path.name}: {e}")
        return False


def main():
    if len(sys.argv) < 2:
        print("用法: python scripts/convert_wmf_to_png.py <input_dir>")
        sys.exit(1)

    input_dir = Path(sys.argv[1])
    if not input_dir.is_dir():
        print(f"[ERROR] 目录不存在: {input_dir}")
        sys.exit(1)

    wmf_files = list(input_dir.rglob("*.wmf"))
    print(f"找到 {len(wmf_files)} 个 .wmf 文件")

    success = 0
    failed = 0
    for i, wmf_path in enumerate(wmf_files, 1):
        if i % 50 == 0 or i == 1:
            print(f"  进度: {i}/{len(wmf_files)}")
        if convert_wmf_to_png(wmf_path):
            success += 1
        else:
            failed += 1

    print(f"\n完成: {success} 成功, {failed} 失败, 共 {len(wmf_files)} 个文件")


if __name__ == "__main__":
    main()
