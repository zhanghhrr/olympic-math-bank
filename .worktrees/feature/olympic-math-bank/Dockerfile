# ============================================
# 奥林匹克数学题库管理系统 - 生产环境 Dockerfile
# - OCR 通过 MinerU API 远程调用（无需 Python）
# - PDF 导出使用 Puppeteer + Chromium 无头渲染
# ============================================

FROM node:20-slim AS base

# ---- 安装系统依赖 ----
# unzip：MinerU API 返回 ZIP 解压
# Chromium 运行时库：Puppeteer 无头浏览器 PDF 渲染
# 中文字体：PDF 中文/CJK 字符正常显示
RUN apt-get update && apt-get install -y --no-install-recommends \
    unzip \
    # Chromium 运行时依赖
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libu2f-udev \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    # 中日韩字体（中文 PDF 必须）
    fonts-noto-cjk \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- 依赖层（利用 Docker 缓存）----
COPY package.json package-lock.json ./
# PUPPETEER_SKIP_DOWNLOAD=false 确保 npm ci 时下载 Chromium
ENV PUPPETEER_SKIP_DOWNLOAD=false
RUN npm ci

# ---- 源码 & 构建 ----
COPY . .

# 切换数据源为 PostgreSQL（本地开发用 SQLite，Docker 部署用 PostgreSQL）
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' lib/db/schema.prisma

# 生成 Prisma Client
RUN npx prisma generate

# 构建 Next.js 生产版本
RUN npm run build

# ---- 运行环境 ----
EXPOSE 3000

# Puppeteer 配置：使用 npm ci 时下载的 Chromium，运行时不再重复下载
ENV PUPPETEER_SKIP_DOWNLOAD=true

# PDF 导出输出目录
RUN mkdir -p /app/exports/pdf

CMD ["npm", "run", "start"]
