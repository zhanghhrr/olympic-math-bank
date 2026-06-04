import json
import os
import time
import requests
import zipfile
import ssl
from pathlib import Path
from gradio_client import handle_file

# 全局禁用 SSL 验证
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

import random
import string
import pypdf
import shutil

# 生成随机 session hash
def generate_session_hash(length=10):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def prepare_pdfs(input_dir: str, work_dir: str, max_pages: int = 19):
    """
    检查 PDF 页数，如果超过 max_pages 则分割，否则直接复制
    """
    input_path = Path(input_dir).resolve()
    work_path = Path(work_dir).resolve()
    
    # 清理并重建工作目录
    if work_path.exists():
        shutil.rmtree(work_path)
    work_path.mkdir(parents=True, exist_ok=True)
    
    pdf_files = list(input_path.glob("*.pdf"))
    if not pdf_files:
        return

    print(f"🔄 正在预处理 {len(pdf_files)} 个 PDF 文件 (检查页数限制)...")
    
    for pdf_file in pdf_files:
        try:
            reader = pypdf.PdfReader(pdf_file)
            num_pages = len(reader.pages)
            
            # API 限制为 20 页
            # 如果页数 <= 20，直接复制
            if num_pages <= 20:
                shutil.copy(pdf_file, work_path / pdf_file.name)
                print(f"   [Copy] {pdf_file.name} ({num_pages} 页)")
            else:
                print(f"   [Split] {pdf_file.name} ({num_pages} 页) -> 超过20页，正在按每 {max_pages} 页切分...")
                for i in range(0, num_pages, max_pages):
                    writer = pypdf.PdfWriter()
                    end_page = min(i + max_pages, num_pages)
                    for page_num in range(i, end_page):
                        writer.add_page(reader.pages[page_num])
                    
                    part_num = (i // max_pages) + 1
                    # 命名格式: 原文件名_1.pdf, 原文件名_2.pdf
                    output_filename = f"{pdf_file.stem}_{part_num}{pdf_file.suffix}"
                    output_path = work_path / output_filename
                    with open(output_path, "wb") as f_out:
                        writer.write(f_out)
                    print(f"      -> 生成: {output_filename} ({end_page - i} 页)")
                    
        except Exception as e:
            print(f"❌ 预处理 PDF 失败: {pdf_file.name} - {e}")
    print("✅ 预处理完成，准备开始转换...\n")

def process_pdfs_via_web(input_dir: str, output_dir: str, should_unzip: bool = False):
    """
    通过直接调用 HTTP 接口转换 PDF
    这是一种更底层的实现，绕过 gradio_client 的自动配置检查
    """
    input_path = Path(input_dir).resolve()
    output_path = Path(output_dir).resolve()

    if not input_path.exists():
        print(f"❌ 输入文件夹不存在: {input_path}")
        return

    output_path.mkdir(parents=True, exist_ok=True)
    pdf_files = list(input_path.glob("*.pdf"))
    if not pdf_files:
        print(f"📂 文件夹中没有找到 PDF 文件: {input_path}")
        return

    print(f"🚀 发现 {len(pdf_files)} 个 PDF 文件，准备开始在线转换...")
    print("⚠️ 注意：由于直接使用 API，如果服务器接口变更可能会导致失败。")

    # MinerU 服务的上传和预测接口
    # Gradio 5.x 通常使用 /upload 上传文件
    # 但是如果是在 ModelScope 的 iframe 环境中，可能需要特定的 header 或 cookie
    # 这里我们尝试模拟更完整的请求头
    
    session = requests.Session()
    session.verify = False # 忽略 SSL 证书验证
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://opendatalab-mineru.ms.show/",
        "Origin": "https://opendatalab-mineru.ms.show"
    })
    
    # 尝试获取主页以初始化 session cookie
    try:
        session.get("https://opendatalab-mineru.ms.show/")
    except:
        pass

    # 强制指定为截图确认的 API 路径
    # 截图显示: /gradio_api/queue/join
    # 截图显示: /gradio_api/queue/data
    
    # 基础 URL
    BASE_URL = "https://opendatalab-mineru.ms.show"
    
    # 1. 探测/确认上传接口
    print("   正在检查 API 状态...")
    upload_url = f"{BASE_URL}/gradio_api/upload"
    
    # 2. 准备预测接口列表 (仅保留确认有效的)
    # 截图确认是 queue/join 模式
    predict_candidates = [
        f"{BASE_URL}/gradio_api/queue/join"
    ]
    
    print(f"   准备尝试以下预测接口: {predict_candidates}")

    for pdf_file in pdf_files:
        print(f"\n📄 正在处理: {pdf_file.name}")
        
        try:
            # 1. 上传文件
            print("   正在上传文件...")
            # Gradio 上传需要 file_id (可选) 和文件内容
            with open(pdf_file, 'rb') as f:
                # 构造符合 Gradio 预期的 multipart/form-data
                files = {'files': (pdf_file.name, f, 'application/pdf')}
                upload_resp = session.post(upload_url, files=files)
            
            if upload_resp.status_code != 200:
                print(f"❌ 上传失败: {upload_resp.status_code} - {upload_resp.text}")
                continue
                
            # 获取上传后的文件路径
            uploaded_files = upload_resp.json()
            if isinstance(uploaded_files, list) and len(uploaded_files) > 0:
                 server_file_path = uploaded_files[0]
            elif isinstance(uploaded_files, dict) and "path" in uploaded_files:
                 server_file_path = uploaded_files["path"]
            else:
                 print(f"❌ 无法解析上传响应: {uploaded_files}")
                 continue
                 
            print(f"   上传成功，服务器路径: {server_file_path}")

            # 2. 调用预测接口
            
            # 构造 Gradio 5.x 期望的文件对象格式
            file_arg = {
                "path": server_file_path,
                "url": f"https://opendatalab-mineru.ms.show/file={server_file_path}",
                "orig_name": pdf_file.name,
                "size": pdf_file.stat().st_size,
                "mime_type": "application/pdf",
                "meta": {"_type": "gradio.FileData"}
            }

            # 构造 payload
            session_hash = generate_session_hash()

            # 根据最新 config 分析得到的正确参数结构 (fn_index=8)
            # ID 8 输入: [5, 8, 24, 20, 19, 23, 11, 14]
            # 1. File (ID 5) - PDF文件
            # 2. Slider (ID 8) - Max Pages, default 20
            # 3. Checkbox (ID 24) - Force OCR, default False
            # 4. Checkbox (ID 20) - Formula Hybrid, default True
            # 5. Checkbox (ID 19) - Table Enable, default True
            # 6. Dropdown (ID 23) - OCR Language, default 'ch'
            # 7. Dropdown (ID 11) - Backend, default 'vlm-auto-engine'
            # 8. Textbox (ID 14) - Server URL, default 'http://localhost:30000'

            payload = {
                "data": [
                    file_arg,                                     # ID 5: File
                    20,                                           # ID 8: Max pages
                    False,                                        # ID 24: Force OCR
                    True,                                         # ID 20: Formula Hybrid
                    True,                                         # ID 19: Table Enable
                    "ch (Chinese, English, Chinese Traditional)", # ID 23: OCR Language
                    "vlm-auto-engine",                            # ID 11: Backend
                    "http://localhost:30000"                      # ID 14: Server URL
                ],
                "event_data": None,
                "fn_index": 8,
                "session_hash": session_hash
            }
            
            # 截图中的 join 请求带有 query params: ?t=...&__theme=dark&backend_url=%2F
            join_params = {
                "t": str(int(time.time() * 1000)),
                "__theme": "dark",
                "backend_url": "/"
            }
            
            # 遍历尝试所有可能的 predict URL
            success = False
            for p_url in predict_candidates:
                print(f"   尝试预测接口: {p_url}")
                
                # 让我们尝试 fn_index=5，这是之前 200 OK 的 index
                # 如果 payload 不对，会在 data 阶段报错
                
                try:
                    predict_resp = session.post(p_url, json=payload, params=join_params)
                    if predict_resp.status_code == 200:
                        print(f"   ✅ 接口调用成功! (URL: {p_url})")
                        success = True
                        break 
                    else:
                         # 404/405 说明路径不对，500 说明参数或 index 不对
                        print(f"   ❌ 接口调用失败: {predict_resp.status_code} - {predict_resp.text}")
                        if predict_resp.status_code in [404, 405]:
                            break 
                except Exception as e:
                    print(f"   ❌ 请求异常: {e}")
                    pass
                
                if success:
                    break 
            
            if not success:
                print(f"❌ 所有预测接口尝试均失败。")
                continue

            # 处理结果
            # 对于 queue/join，返回的也是 event_id，需要处理 SSE
            result_data = predict_resp.json()
            event_id = result_data.get("event_id")
            
            if event_id:
                print(f"   任务已提交 (Event ID: {event_id})，正在等待结果...")
                # queue/join 的结果流通常在 /queue/data?session_hash=...
                # 但 Gradio 3/4 的 SSE 是通过 GET /queue/data 建立长连接的
                
                # 由于这里使用了 requests 且不想引入太复杂的 SSE 客户端
                # 我们尝试轮询 /queue/data
                
                # 构建 data url
                # 如果预测接口是 /gradio_api/queue/join，那么 data 接口通常是 /gradio_api/queue/data
                base_api = p_url.rsplit('/', 2)[0] # 去掉 /queue/join
                data_url = f"{base_api}/queue/data"
                
                # 截图中的 data 请求 params: session_hash=..., studio_token=
                data_params = {
                    "session_hash": session_hash,
                    "studio_token": ""
                }
                
                # 监听 SSE
                try:
                    # 使用 while 循环来持续读取数据流，处理可能的超时
                    # 某些 SSE 实现可能会在心跳包时断开
                    with session.get(data_url, params=data_params, stream=True) as resp:
                        for line in resp.iter_lines():
                            if line:
                                decoded_line = line.decode('utf-8')
                                if decoded_line.startswith("data: "):
                                    try:
                                        msg = json.loads(decoded_line[6:])
                                        msg_type = msg.get("msg")
                                        
                                        if msg_type == "process_completed":
                                            # 成功完成
                                            if "output" in msg and "data" in msg["output"]:
                                                data_list = msg["output"]["data"]
                                                # 新的 API 格式: data_list 是组件更新指令列表
                                                # fn_index=8 的输出顺序: [33, 34, 37, 39, 29]
                                                # ID 34 是 file 类型，包含输出文件

                                                zip_url = None
                                                zip_found = False

                                                # 遍历 data_list 查找文件更新指令
                                                for i, item in enumerate(data_list):
                                                    if isinstance(item, dict):
                                                        # 检查是否是文件组件的更新 (ID 34)
                                                        # 新的格式: {'__type__': 'update', 'value': {...}}
                                                        if item.get("__type__") == "update" and "value" in item:
                                                            value = item["value"]
                                                            # value 可能是文件对象或文件对象列表
                                                            if isinstance(value, list) and len(value) > 0:
                                                                file_obj = value[0]
                                                            elif isinstance(value, dict):
                                                                file_obj = value
                                                            else:
                                                                continue

                                                            if isinstance(file_obj, dict):
                                                                # 检查是否是 zip 文件
                                                                orig_name = file_obj.get("orig_name", "")
                                                                path = file_obj.get("path", "")
                                                                if orig_name.endswith(".zip") or path.endswith(".zip"):
                                                                    zip_url = file_obj.get("url")
                                                                    if not zip_url and path:
                                                                        zip_url = f"https://opendatalab-mineru.ms.show/file={path}"
                                                                    zip_found = True
                                                                    break
                                                        # 旧格式兼容: 直接是文件对象
                                                        elif "path" in item or "url" in item:
                                                            orig_name = item.get("orig_name", "")
                                                            path = item.get("path", "")
                                                            if orig_name.endswith(".zip") or path.endswith(".zip"):
                                                                zip_url = item.get("url")
                                                                if not zip_url and path:
                                                                    zip_url = f"https://opendatalab-mineru.ms.show/file={path}"
                                                                zip_found = True
                                                                break

                                                if zip_found and zip_url:
                                                    print(f"   转换成功，正在下载: {zip_url}")
                                                    # 下载逻辑...
                                                    # 用户要求：直接在 output_dir 下保存 zip，命名为 {filename}.zip，不要套文件夹
                                                    zip_filename = f"{pdf_file.stem}.zip"
                                                    zip_save_path = output_path / zip_filename

                                                    zip_dl_resp = session.get(zip_url)
                                                    if zip_dl_resp.status_code == 200:
                                                        with open(zip_save_path, "wb") as f:
                                                            f.write(zip_dl_resp.content)

                                                        if should_unzip:
                                                            # 解压到同名文件夹
                                                            extract_dir = output_path / pdf_file.stem
                                                            extract_dir.mkdir(parents=True, exist_ok=True)
                                                            try:
                                                                with zipfile.ZipFile(zip_save_path, 'r') as zip_ref:
                                                                    zip_ref.extractall(extract_dir)
                                                                # 解压后删除 zip
                                                                os.remove(zip_save_path)
                                                                print(f"✅ 处理完成! 结果保存在: {extract_dir}")
                                                            except zipfile.BadZipFile:
                                                                print("❌ 下载的文件损坏，无法解压")
                                                        else:
                                                            print(f"✅ 下载完成! ZIP保存在: {zip_save_path}")
                                                    else:
                                                        print(f"❌ ZIP 下载失败")
                                                else:
                                                    print(f"⚠️ 任务完成但未找到 ZIP: {msg}")
                                            else:
                                                # 有时 output 为 null，或者格式不同，比如报错
                                                print(f"⚠️ 任务完成但无数据返回 (可能是处理失败): {msg}")
                                            break # 退出 SSE
                                            
                                        elif msg_type == "queue_full":
                                            print("⚠️ 队列已满，正在等待重试...")
                                        elif msg_type == "estimation":
                                            # 打印排队信息
                                            rank = msg.get("rank", "?")
                                            queue_size = msg.get("queue_size", "?")
                                            print(f"   正在排队: 第 {rank} 位 (共 {queue_size} 位)", end="\r")
                                        elif msg_type == "process_starts":
                                            print(f"   开始处理...          ")
                                            
                                    except json.JSONDecodeError:
                                        pass
                except Exception as e:
                    print(f"❌ 结果监听失败: {e}")

            # 如果不是 queue/join 而是 run/predict，直接解析 data
            elif "data" in result_data:
                results = result_data["data"]
                # 寻找 zip 文件
                zip_url = None
                for item in results:
                    # 检查是否是文件对象
                    if isinstance(item, dict) and "path" in item:
                        path = item["path"]
                        if path.endswith(".zip"):
                            zip_url = item.get("url")
                            if not zip_url:
                                zip_url = f"https://opendatalab-mineru.ms.show/file={path}"
                            break
                    # 检查是否是字符串路径
                    elif isinstance(item, str) and item.endswith(".zip"):
                        zip_url = f"https://opendatalab-mineru.ms.show/file={item}"
                        break

                if zip_url:
                    print(f"   转换成功，正在下载: {zip_url}")
                    # 用户要求：直接在 output_dir 下保存 zip，命名为 {filename}.zip，不要套文件夹
                    zip_filename = f"{pdf_file.stem}.zip"
                    zip_save_path = output_path / zip_filename
                    
                    # 下载 ZIP
                    zip_resp = session.get(zip_url)
                    if zip_resp.status_code == 200:
                        with open(zip_save_path, "wb") as f:
                            f.write(zip_resp.content)
                        
                        if should_unzip:
                            # 解压到同名文件夹
                            extract_dir = output_path / pdf_file.stem
                            extract_dir.mkdir(parents=True, exist_ok=True)
                            try:
                                with zipfile.ZipFile(zip_save_path, 'r') as zip_ref:
                                    zip_ref.extractall(extract_dir)
                                # 删除 zip 包
                                os.remove(zip_save_path)
                                print(f"✅ 处理完成! 结果保存在: {extract_dir}")
                            except zipfile.BadZipFile:
                                print("❌ 下载的文件损坏，无法解压")
                        else:
                            print(f"✅ 下载完成! ZIP保存在: {zip_save_path}")
                    else:
                        print(f"❌ 下载 ZIP 失败: {zip_resp.status_code}")
                else:
                    print(f"⚠️ 未能从结果中找到 ZIP 文件。")

        except Exception as e:
            print(f"❌ 处理异常: {e}")
            continue

    print(f"\n✨ 任务结束。")

if __name__ == "__main__":
    import sys
    import argparse
    # 忽略 urllib3 的 SSL 警告
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    parser = argparse.ArgumentParser(description='PDF Converter via Web API')
    parser.add_argument('input_dir', nargs='?', default="input_pdfs", help='Input folder containing PDFs')
    parser.add_argument('--unzip', action='store_true', help='Auto unzip the result file (Default: False)')
    
    args = parser.parse_args()
    
    INPUT_FOLDER = args.input_dir
    OUTPUT_FOLDER = "output_web"
    SHOULD_UNZIP = args.unzip
    
    if not os.path.exists(INPUT_FOLDER):
        os.makedirs(INPUT_FOLDER)
        print(f"提示: 已创建 '{INPUT_FOLDER}' 文件夹，请将 PDF 文件放入其中。")
    else:
        CUT_FOLDER = "cut_fold"
        prepare_pdfs(INPUT_FOLDER, CUT_FOLDER)
        # 将分割后的文件 (在 CUT_FOLDER) 转换并保存到 OUTPUT_FOLDER
        process_pdfs_via_web(CUT_FOLDER, OUTPUT_FOLDER, should_unzip=SHOULD_UNZIP)
