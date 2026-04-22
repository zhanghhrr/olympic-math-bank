@echo off
REM 奥林匹克数学题库系统 - 快速启动脚本 (Windows)

echo ==========================================
echo 奥林匹克数学题库系统 - 本地开发环境设置
echo ==========================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未检测到 Node.js
    echo 请先安装 Node.js: https://nodejs.org/
    exit /b 1
)
echo ✓ Node.js 版本: 
node --version

REM 检查 npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未检测到 npm
    exit /b 1
)
echo ✓ npm 版本: 
npm --version

REM 安装依赖
echo.
echo 📦 正在安装依赖...
call npm install

REM 配置环境变量
echo.
echo ⚙️  配置环境变量...
if not exist .env.local (
    if exist .env.example (
        copy .env.example .env.local >nul
        echo ✓ 已创建 .env.local ^(使用默认配置^)
    ) else (
        echo ⚠️  警告: 未找到 .env.example，跳过环境配置
    )
) else (
    echo ✓ .env.local 已存在
)

REM 生成 Prisma Client
echo.
echo 🗄️  生成 Prisma Client...
call npx prisma generate

echo.
echo ==========================================
echo ✅ 设置完成！
echo ==========================================
echo.
echo 启动开发服务器:
echo   npm run dev
echo.
echo 访问地址: http://localhost:3000
echo.
echo 默认管理员账号:
echo   邮箱: admin@example.com
echo   密码: admin123
echo.
pause
