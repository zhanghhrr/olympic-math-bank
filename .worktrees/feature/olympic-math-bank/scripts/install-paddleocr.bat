@echo off
REM PaddleOCR 安装脚本 (Windows)

echo 🚀 安装 PaddleOCR-VL...

REM 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: 未找到 Python
    echo 请先安装 Python 3.8+
    exit /b 1
)

for /f "tokens=2" %%a in ('python --version 2^>^&1') do set PYTHON_VERSION=%%a
echo ✅ Python 版本: %PYTHON_VERSION%

REM 创建虚拟环境（如果不存在）
if not exist "venv" (
    echo 📦 创建虚拟环境...
    python -m venv venv
)

REM 激活虚拟环境
echo 🔌 激活虚拟环境...
call venv\Scripts\activate

REM 升级 pip
echo ⬆️ 升级 pip...
python -m pip install --upgrade pip

REM 安装 PaddlePaddle
echo 🎯 安装 PaddlePaddle (CPU 版本)...
pip install paddlepaddle

REM 可选：安装 GPU 版本（需要 CUDA）
REM pip install paddlepaddle-gpu

REM 安装 PaddleOCR
echo 📚 安装 PaddleOCR...
pip install "paddleocr[all]"

REM 安装 FastAPI 和 Uvicorn（用于 API 服务）
echo 🌐 安装 FastAPI 和 Uvicorn...
pip install fastapi uvicorn

REM 验证安装
echo ✅ 验证安装...
python -c "from paddleocr import PaddleOCRVL; print('PaddleOCR-VL 安装成功')"
python -c "from paddleocr import PPStructureV3; print('PP-StructureV3 安装成功')"
python -c "from paddleocr import PaddleOCR; print('PaddleOCR 安装成功')"

echo.
echo 🎉 PaddleOCR-VL 安装完成!
echo.
echo 使用方法:
echo   1. 启动 API 服务器:
echo      python lib/ocr/paddle_vl_service.py --server
echo.
echo   2. 测试单张图片:
echo      python lib/ocr/paddle_vl_service.py -i test.png --mode math
echo.
echo   3. 在前端使用 PaddleVLUploader 组件

pause
