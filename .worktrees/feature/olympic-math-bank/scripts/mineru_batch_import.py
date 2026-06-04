#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════╗
║     MinerU PDF 批量识别脚本 v1.0                              ║
║     对接 MinerU v4 Precision Extract API                     ║
║     递归识别 input/ 目录下全部 PDF，输出 MD + JSON 到 output/  ║
╚══════════════════════════════════════════════════════════════╝

==== 运行依赖 ====
  - Python 3.8+
  - pip install requests

==== 部署步骤 ====
  1. 将本脚本放置到任意本地工作目录（如 D:\ocr_workspace\）
  2. 安装依赖: pip install requests
  3. 配置 Token（见下方 Token 配置指引）
  4. 将待识别的 PDF 文件放入脚本同级的 input/ 目录（支持子文件夹）
  5. 终端运行: python mineru_batch_import.py
  6. 识别结果自动输出到 output/ 目录

==== Token 配置指引 ====
  方式一（推荐）: 环境变量
    Windows (PowerShell): $env:MINERU_API_TOKEN="your_token_here"
    Windows (CMD):        set MINERU_API_TOKEN=your_token_here
    macOS / Linux:        export MINERU_API_TOKEN=your_token_here

  方式二: .env 文件
    在脚本同目录创建 .env 文件，内容为:
    MINERU_API_TOKEN=your_token_here

  Token 获取: 登录 https://mineru.net → 个人中心 → API Token
  注意: 请勿将 Token 提交到版本控制系统

==== 输入规范 ====
  - 支持 .pdf 和 .PDF 扩展名
  - 递归遍历 input/ 下所有层级的子文件夹
  - 单文件上限 200MB（MinerU API 限制）

==== 输出规范 ====
  - 输出文件名 = 相对路径用下划线扁平化
    例: input/专业课程/计算机原理/第一章.pdf
      → output/专业课程_计算机原理_第一章.md
      → output/专业课程_计算机原理_第一章.json
      → output/专业课程_计算机原理_第一章_images/  (嵌入图片)
  - MD 文件中图片引用已自动修正为本地相对路径
  - JSON 包含 content_list（结构化版面解析结果）

==== 去重机制 ====
  - 基于文件 SHA256 哈希值自动去重
  - 去重记录持久化在 .mineru_hash_cache.json 中
  - 删除该文件可重置去重记录
"""

import os
import sys
import hashlib
import json
import time
import zipfile
import io
import re
from pathlib import Path
from typing import Optional, Dict

# ============================================================
# 依赖检查
# ============================================================

try:
    import requests
except ImportError:
    print("=" * 60)
    print(" 错误: 缺少 requests 库")
    print("=" * 60)
    print()
    print("请运行以下命令安装依赖:")
    print("  pip install requests")
    print()
    sys.exit(1)

# ============================================================
# 全局配置
# ============================================================

MINERU_BASE_URL = "https://mineru.net"
POLL_INTERVAL = 3         # 轮询间隔（秒）
POLL_TIMEOUT = 600        # 单任务最大等待时间（秒）
MAX_FILE_SIZE = 200 * 1024 * 1024  # 200MB (MinerU API 上限)
TMPFILES_MAX_SIZE = 100 * 1024 * 1024  # 100MB (tmpfiles.org 免费上限)
SUPPORTED_EXTENSIONS = {".pdf", ".PDF"}

# MinerU v4 默认参数（VLM 模型 + 强制 OCR + 公式 + 表格）
DEFAULT_OPTIONS = {
    "model_version": "vlm",
    "is_ocr": True,
    "enable_formula": True,
    "enable_table": True,
    "language": "ch",
}

# ============================================================
# Token 加载
# ============================================================

def load_token() -> str:
    """
    按优先级加载 MinerU API Token:
      1. 环境变量 MINERU_API_TOKEN
      2. 脚本同目录 .env 文件
    """
    token = os.environ.get("MINERU_API_TOKEN", "").strip()
    if token:
        return token

    env_file = Path(__file__).parent / ".env"
    if env_file.is_file():
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("MINERU_API_TOKEN="):
                        val = line.split("=", 1)[1].strip().strip('"').strip("'")
                        if val and val != "your_token_here":
                            return val
        except OSError:
            pass

    return ""


# 默认 Token（可被环境变量或 .env 文件覆盖）
_DEFAULT_TOKEN = "eyJ0eXBlIjoiSldUIiwiYWxnIjoiSFM1MTIifQ.eyJqdGkiOiI0NzIwMDQyNSIsInJvbCI6IlJPTEVfUkVHSVNURVIiLCJpc3MiOiJPcGVuWExhYiIsImlhdCI6MTc4MDUzOTAxNSwiY2xpZW50SWQiOiJsa3pkeDU3bnZ5MjJqa3BxOXgydyIsInBob25lIjoiIiwib3BlbklkIjpudWxsLCJ1dWlkIjoiN2FjYzZlYjQtNjA2MC00ZTAyLWIwNmItYmNjYWVkYzM0ZGMxIiwiZW1haWwiOiIiLCJleHAiOjE3ODgzMTUwMTV9.x22WL-H6S-KWb6H_IiWdgI3l8-aIXSShZmDbT7123LW8XbTVR5H9LhdAr01P4hAO7xB8smNeE3UQap9amUF6Og"

MINERU_API_TOKEN = load_token() or _DEFAULT_TOKEN

AUTH_HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {MINERU_API_TOKEN}",
}

# ============================================================
# 日志工具
# ============================================================

def log(msg: str, level: str = "INFO") -> None:
    """统一日志输出，带时间戳与级别标记"""
    ts = time.strftime("%H:%M:%S")
    prefix = {"INFO": " ", "WARN": "!", "ERROR": "✗", "OK": "✓"}.get(level, " ")
    print(f"[{ts}] {prefix} {msg}")


# ============================================================
# 文件工具
# ============================================================

def compute_sha256(file_path: Path) -> str:
    """计算文件 SHA256 哈希（分块读取，支持大文件）"""
    sha256 = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
    except (OSError, IOError) as e:
        raise IOError(f"无法读取文件 '{file_path}': {e}")
    return sha256.hexdigest()


def relative_to_flat_name(file_path: Path, base_dir: Path) -> str:
    """
    将相对于 base_dir 的路径转换为扁平文件名。

    规则: 去掉扩展名，路径分隔符替换为下划线。
    示例:
      input/专业课程/计算机原理/第一章.pdf → 专业课程_计算机原理_第一章
      input/root.pdf                     → root
    """
    try:
        rel = file_path.resolve().relative_to(base_dir.resolve())
    except ValueError:
        # 文件不在 base_dir 下时，仅使用文件名
        rel = Path(file_path.name)

    parts = list(rel.parts)
    # 最后一个 part 去掉扩展名
    parts[-1] = Path(parts[-1]).stem
    # 过滤空字符串并拼接
    return "_".join(p for p in parts if p)


def collect_pdfs(input_dir: Path) -> list[Path]:
    """递归收集 input 目录下所有 PDF 文件，按路径排序"""
    pdfs: list[Path] = []
    for ext in SUPPORTED_EXTENSIONS:
        pdfs.extend(sorted(input_dir.rglob(f"*{ext}")))
    # 去重（同一文件可能因大小写被收集两次）
    seen: set[str] = set()
    unique: list[Path] = []
    for p in pdfs:
        resolved = str(p.resolve())
        if resolved not in seen:
            seen.add(resolved)
            unique.append(p)
    return sorted(unique, key=lambda p: str(p))


# ============================================================
# MinerU API 客户端
# ============================================================

def upload_to_tmpfiles(file_path: Path) -> Optional[str]:
    """
    将文件上传到 tmpfiles.org 临时托管，获取公开 URL。

    返回公开 URL（可直接被 MinerU API 访问），失败返回 None。
    tmpfiles.org 免费，单文件上限 100MB，文件保留约 1 小时。
    """
    file_size = file_path.stat().st_size
    if file_size > TMPFILES_MAX_SIZE:
        log(f"文件 {file_size / 1024 / 1024:.1f}MB 超过 tmpfiles.org 100MB 上限", "WARN")

    log("  上传到临时托管 (tmpfiles.org) ...")
    try:
        with open(file_path, "rb") as f:
            resp = requests.post(
                "https://tmpfiles.org/api/v1/upload",
                files={"file": (file_path.name, f)},
                timeout=120,
            )
        data = resp.json()
        url = data.get("data", {}).get("url", "")
        if url:
            url = url.replace("tmpfiles.org/", "tmpfiles.org/dl/")
            log(f"  托管成功: {url}", "OK")
            return url
        else:
            log(f"  响应中无 URL: {data}", "ERROR")
    except requests.RequestException as e:
        log(f"  上传失败: {e}", "ERROR")
    return None


def create_extract_task(file_url: str) -> Optional[str]:
    """
    通过公开 URL 创建 MinerU 提取任务。

    返回 task_id，失败返回 None。
    """
    payload: dict = {
        "url": file_url,
        **DEFAULT_OPTIONS,
    }

    try:
        resp = requests.post(
            f"{MINERU_BASE_URL}/api/v4/extract/task",
            json=payload,
            headers=AUTH_HEADERS,
            timeout=30,
        )
        data = resp.json()

        if data.get("code") == 0:
            task_id = data["data"]["task_id"]
            log(f"  任务已创建: {task_id}", "OK")
            return task_id

        code = data.get("code")
        msg = data.get("msg", "未知错误")
        log(f"  创建任务失败 (code={code}): {msg}", "ERROR")

        # Token 失效检测
        if code == 401 or "unauthorized" in msg.lower():
            log("  请检查 MINERU_API_TOKEN 是否有效", "ERROR")
            log("  获取地址: https://mineru.net → 个人中心 → API Token", "ERROR")

    except requests.RequestException as e:
        log(f"  创建任务网络异常: {e}", "ERROR")
    return None


def poll_extract_task(task_id: str) -> Optional[dict]:
    """
    轮询 MinerU 提取任务状态，直到完成、失败或超时。

    返回完整任务数据（含 full_zip_url），失败/超时返回 None。
    """
    start_time = time.time()
    last_progress = ""

    while time.time() - start_time < POLL_TIMEOUT:
        try:
            resp = requests.get(
                f"{MINERU_BASE_URL}/api/v4/extract/task/{task_id}",
                headers=AUTH_HEADERS,
                timeout=15,
            )
            data = resp.json()

            if data.get("code") != 0:
                code = data.get("code")
                if code == -60012:
                    time.sleep(POLL_INTERVAL)
                    continue
                log(f"  查询任务状态失败 (code={code}): {data.get('msg', '')}", "ERROR")
                return None

            task_data = data["data"]
            state = task_data.get("state", "unknown")

            if state == "done":
                log("  提取完成", "OK")
                return task_data

            if state == "failed":
                err = task_data.get("err_msg", "未知错误")
                log(f"  提取失败: {err}", "ERROR")
                # PDF 格式损坏的常见错误
                if "corrupt" in err.lower() or "invalid" in err.lower():
                    log("  提示: PDF 文件可能已损坏或格式不受支持", "WARN")
                return None

            if state in ("running", "converting"):
                progress = task_data.get("extract_progress", {})
                pages_done = progress.get("extracted_pages", "?")
                pages_total = progress.get("total_pages", "?")
                prog_msg = f"进度: {pages_done}/{pages_total} 页"
                if prog_msg != last_progress:
                    last_progress = prog_msg
                    log(f"  {prog_msg}")
            else:
                log(f"  状态: {state}")

        except requests.RequestException as e:
            log(f"  轮询网络异常: {e}", "WARN")
            # 网络抖动时继续重试

        time.sleep(POLL_INTERVAL)

    log(f"  轮询超时 ({POLL_TIMEOUT}s)", "ERROR")
    return None


def download_and_process(
    zip_url: str,
    output_dir: Path,
    base_name: str,
) -> Optional[dict]:
    """
    下载结果 ZIP，提取 MD + content_list JSON + 嵌入图片。

    - 保存 {base_name}.md（含修正后的图片引用）
    - 保存 {base_name}.json（content_list 结构化数据）
    - 提取 images/ 到 {base_name}_images/ 目录
    - 自动修正 MD 中的图片引用为本地路径
    """
    log("  下载识别结果 ...")
    try:
        resp = requests.get(zip_url, timeout=120)
        resp.raise_for_status()
    except requests.RequestException as e:
        log(f"  下载 ZIP 失败: {e}", "ERROR")
        return None

    md_content = ""
    content_list = None
    images_map: dict[str, bytes] = {}  # 文件名 → 二进制数据

    # 已知的文件命名模式
    image_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}

    try:
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            for entry_name in zf.namelist():
                lower = entry_name.lower()

                # 主 Markdown 文件
                if entry_name.endswith(".md") or entry_name == "full.md":
                    if not md_content:
                        md_content = zf.read(entry_name).decode("utf-8", errors="replace")

                # content_list JSON
                elif entry_name.endswith("_content_list.json"):
                    try:
                        content_list = json.loads(zf.read(entry_name).decode("utf-8"))
                    except json.JSONDecodeError:
                        log(f"  content_list JSON 解析失败，跳过", "WARN")

                # 嵌入图片
                elif any(lower.endswith(ext) for ext in image_exts):
                    images_map[entry_name] = zf.read(entry_name)

    except (zipfile.BadZipFile, OSError) as e:
        log(f"  ZIP 解压失败: {e}", "ERROR")
        return None

    if not md_content:
        log("  ZIP 中未找到任何 .md 文件", "ERROR")
        return None

    # --- 保存 Markdown ---
    md_output_path = output_dir / f"{base_name}.md"

    # 提取并修正图片引用
    images_dir = output_dir / f"{base_name}_images"
    if images_map:
        images_dir.mkdir(parents=True, exist_ok=True)

        # 修正 MD 中的图片引用
        for orig_path, img_data in images_map.items():
            # 原始路径如 "images/xxx.png" 或 "images/xxx_0.png"
            # 转换为 {base_name}_images/xxx.png
            orig_name = Path(orig_path).name
            local_rel_path = f"{base_name}_images/{orig_name}"
            dest_path = images_dir / orig_name

            try:
                with open(dest_path, "wb") as f:
                    f.write(img_data)
            except OSError as e:
                log(f"  图片写入失败 {orig_name}: {e}", "WARN")
                continue

            # 替换 MD 中的引用（支持 Markdown 和 HTML img 标签）
            escaped = re.escape(orig_path)
            md_content = re.sub(
                rf'\]\({escaped}\)',
                f']({local_rel_path})',
                md_content,
            )
            md_content = re.sub(
                rf'src="{escaped}"',
                f'src="{local_rel_path}"',
                md_content,
                flags=re.IGNORECASE,
            )

        log(f"  嵌入图片: {len(images_map)} 个", "OK")

    try:
        with open(md_output_path, "w", encoding="utf-8") as f:
            f.write(md_content)
        log(f"  MD 已保存: {md_output_path.name}", "OK")
    except OSError as e:
        log(f"  MD 写入失败: {e}", "ERROR")
        return None

    # --- 保存结构化 JSON ---
    json_output_path = output_dir / f"{base_name}.json"
    output_json = {
        "source_file": base_name,
        "content_list": content_list or [],
        "processed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    try:
        with open(json_output_path, "w", encoding="utf-8") as f:
            json.dump(output_json, f, ensure_ascii=False, indent=2)
        log(f"  JSON 已保存: {json_output_path.name}", "OK")
    except OSError as e:
        log(f"  JSON 写入失败: {e}", "ERROR")
        return None

    return {"md": md_content, "content_list": content_list}


# ============================================================
# 单文件处理流水线
# ============================================================

def process_single_pdf(
    pdf_path: Path,
    input_dir: Path,
    output_dir: Path,
    processed_hashes: Dict[str, str],
) -> bool:
    """
    处理单个 PDF 文件的完整流水线。

    步骤: 去重检查 → 上传托管 → 创建任务 → 轮询 → 下载结果
    返回 True 表示成功，False 表示失败。
    """
    base_name = relative_to_flat_name(pdf_path, input_dir)

    log(f"")
    log(f"{'─' * 50}")
    log(f"文件: {base_name}.pdf")

    # 文件存在性检查
    if not pdf_path.is_file():
        log(f"文件不存在: {pdf_path}", "ERROR")
        return False

    # 文件格式检查（简单签名校验）
    try:
        with open(pdf_path, "rb") as f:
            header = f.read(5)
        if not header.startswith(b"%PDF-"):
            log(f"文件头不是有效 PDF 格式 (头部: {header[:5]!r})", "ERROR")
            return False
    except (OSError, IOError) as e:
        log(f"文件读取失败: {e}", "ERROR")
        return False

    # 文件大小检查
    file_size = pdf_path.stat().st_size
    if file_size > MAX_FILE_SIZE:
        log(f"文件 {file_size / 1024 / 1024:.1f}MB 超过 200MB 上限", "ERROR")
        return False
    log(f"大小: {file_size / 1024 / 1024:.1f} MB")

    # SHA256 去重
    try:
        file_hash = compute_sha256(pdf_path)
    except (OSError, IOError) as e:
        log(f"SHA256 计算失败: {e}", "ERROR")
        return False

    if file_hash in processed_hashes:
        log(f"跳过: 与 '{processed_hashes[file_hash]}' 内容完全相同", "WARN")
        return True  # 不算失败，只是跳过

    # 检查输出是否已存在（幂等保护）
    md_output = output_dir / f"{base_name}.md"
    json_output = output_dir / f"{base_name}.json"
    if md_output.exists() and json_output.exists():
        log(f"输出文件已存在，跳过", "WARN")
        processed_hashes[file_hash] = base_name
        return True

    # Step 1: 上传到临时托管获取公开 URL
    public_url = upload_to_tmpfiles(pdf_path)
    if not public_url:
        return False

    # Step 2: 创建 MinerU 提取任务
    task_id = create_extract_task(public_url)
    if not task_id:
        return False

    # Step 3: 轮询任务状态
    task_result = poll_extract_task(task_id)
    if not task_result:
        return False

    # Step 4: 下载并处理结果
    zip_url = task_result.get("full_zip_url", "")
    if not zip_url:
        log("API 未返回结果下载地址", "ERROR")
        return False

    result = download_and_process(zip_url, output_dir, base_name)
    if result is None:
        return False

    # 记录处理成功
    processed_hashes[file_hash] = base_name
    log(f"完成: {base_name}", "OK")
    return True


# ============================================================
# 主入口
# ============================================================

def main() -> None:
    """脚本主入口"""
    script_dir = Path(__file__).parent.resolve()
    input_dir = script_dir / "input"
    output_dir = script_dir / "output"
    hash_cache_file = script_dir / ".mineru_hash_cache.json"

    # ── 启动信息 ──
    print()
    log("=" * 60)
    log("MinerU PDF 批量识别脚本 v1.0")
    log(f"工作目录: {script_dir}")
    log(f"API 端点: {MINERU_BASE_URL}")
    masked = MINERU_API_TOKEN[:8] + "****" + MINERU_API_TOKEN[-4:] if len(MINERU_API_TOKEN) > 12 else "****"
    log(f"Token:    {masked}")
    log("=" * 60)

    # ── 自动创建目录 ──
    if not input_dir.is_dir():
        try:
            input_dir.mkdir(parents=True)
            log(f"已创建 input 目录: {input_dir}")
            log("请将 PDF 文件放入 input 目录后重新运行脚本")
        except OSError as e:
            log(f"无法创建 input 目录: {e}", "ERROR")
        return

    if not output_dir.is_dir():
        try:
            output_dir.mkdir(parents=True)
            log(f"已创建 output 目录: {output_dir}")
        except OSError as e:
            log(f"无法创建 output 目录: {e}", "ERROR")
            return

    # ── 收集 PDF 文件 ──
    pdf_files = collect_pdfs(input_dir)

    if not pdf_files:
        log("")
        log("input 目录中未找到任何 PDF 文件", "WARN")
        log("请将 PDF 文件放入 input/ 目录（支持子文件夹）后重新运行")
        return

    log(f"")
    log(f"发现 {len(pdf_files)} 个 PDF 文件:")
    for pf in pdf_files:
        try:
            rel = pf.resolve().relative_to(input_dir.resolve())
        except ValueError:
            rel = pf
        log(f"  · {rel}")

    # ── 加载去重缓存 ──
    processed_hashes: Dict[str, str] = {}
    if hash_cache_file.is_file():
        try:
            with open(hash_cache_file, "r", encoding="utf-8") as f:
                processed_hashes = json.load(f)
            log(f"已加载 {len(processed_hashes)} 条去重记录")
        except (json.JSONDecodeError, OSError):
            log("去重缓存文件损坏，已重置", "WARN")

    # ── 批量处理 ──
    success = 0
    failed = 0
    total = len(pdf_files)

    start_all = time.time()

    for idx, pdf_path in enumerate(pdf_files, 1):
        log(f"")
        log(f"{'#' * 50}")
        log(f"[{idx}/{total}]")

        try:
            result = process_single_pdf(pdf_path, input_dir, output_dir, processed_hashes)
        except Exception as e:
            log(f"未预期的异常: {e}", "ERROR")
            import traceback
            traceback.print_exc()
            result = False

        if result:
            success += 1
        else:
            failed += 1

        # 每处理一个文件就持久化去重缓存（防止中断丢失进度）
        try:
            with open(hash_cache_file, "w", encoding="utf-8") as f:
                json.dump(processed_hashes, f, ensure_ascii=False, indent=2)
        except OSError as e:
            log(f"缓存写入失败: {e}", "WARN")

    # ── 最终汇总 ──
    elapsed_total = time.time() - start_all
    log(f"")
    log("=" * 60)
    log("批量处理完成")
    log(f"  总计: {total} 个文件")
    log(f"  成功: {success} 个")
    log(f"  失败: {failed} 个")
    log(f"  耗时: {elapsed_total:.0f} 秒")
    log(f"  输出: {output_dir}")
    log("=" * 60)

    if failed > 0:
        log("")
        log("部分文件处理失败，请检查上方错误日志排查原因", "WARN")
        log("常见原因: PDF 损坏、Token 失效、网络不通、文件过大")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("")
        log("用户中断，脚本已退出", "WARN")
        sys.exit(130)
