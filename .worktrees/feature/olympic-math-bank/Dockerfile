# ============================================
# 奥林匹克数学题库管理系统 - 生产环境 Dockerfile
# 纯 Node.js 运行环境，OCR 通过 MinerU API 远程调用
# ============================================

FROM node:20-slim AS base

# 安装 unzip（MinerU API 返回 ZIP 需要解压）
RUN apt-get update && apt-get install -y --no-install-recommends \
    unzip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- 依赖层（利用 Docker 缓存）----
COPY package.json package-lock.json ./
RUN npm ci

# ---- 源码 & 构建 ----
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 构建 Next.js 生产版本
RUN npm run build

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["npm", "run", "start"]
