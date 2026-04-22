#!/bin/bash
# 奥林匹克数学题库系统 - 快速启动脚本
# 适用于 macOS/Linux/Git Bash on Windows

set -e  # 遇到错误立即退出

echo "=========================================="
echo "奥林匹克数学题库系统 - 本地开发环境设置"
echo "=========================================="
echo ""

# 1. 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未检测到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    exit 1
fi
echo "✓ Node.js 版本: $(node --version)"

# 2. 检查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ 错误: 未检测到 npm"
    exit 1
fi
echo "✓ npm 版本: $(npm --version)"

# 3. 安装依赖
echo ""
echo "📦 正在安装依赖..."
npm install

# 4. 配置环境变量
echo ""
echo "⚙️  配置环境变量..."
if [ ! -f .env.local ]; then
    if [ -f .env.example ]; then
        cp .env.example .env.local
        echo "✓ 已创建 .env.local (使用默认配置)"
    else
        echo "⚠️  警告: 未找到 .env.example，跳过环境配置"
    fi
else
    echo "✓ .env.local 已存在"
fi

# 5. 生成 Prisma Client
echo ""
echo "🗄️  生成 Prisma Client..."
npx prisma generate

# 6. 完成
echo ""
echo "=========================================="
echo "✅ 设置完成！"
echo "=========================================="
echo ""
echo "启动开发服务器:"
echo "  npm run dev"
echo ""
echo "访问地址: http://localhost:3000"
echo ""
echo "默认管理员账号:"
echo "  邮箱: admin@example.com"
echo "  密码: admin123"
echo ""
