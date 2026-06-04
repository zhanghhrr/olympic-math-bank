# ============================================
# 奥林匹克数学题库管理系统 - 生产环境 Dockerfile
# 支持 Node.js (Next.js) + Python (OCR)
# ============================================

FROM python:3.11-slim AS base

# 安装 Node.js 20 LTS
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 安装 OCR 系统依赖（可选：Tesseract 备用引擎）
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-chi-sim \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Python 依赖层（利用缓存）----
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- Node.js 依赖层（利用缓存）----
COPY package.json package-lock.json ./
RUN npm ci

# ---- 源码 & 构建层 ----
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 构建 Next.js 生产版本
RUN npm run build

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["npm", "run", "start"]
