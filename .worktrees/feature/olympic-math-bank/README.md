# 奥林匹克数学题库管理系统

基于 Next.js 14 + Prisma + SQLite 的奥林匹克数学题库管理系统，支持题目管理、OCR 导入、审核流程等。

## 功能特性

- **题目管理**: 支持填空题、选择题、解答题、计算题
- **批量导入**: 支持通过 OCR 识别从图片/PDF 批量导入题目
- **审核流程**: 多人协作的题目审核机制
- **知识标签**: 五级知识标签体系（模块→专题→子专题→知识点→技能）
- **LaTeX 支持**: 完整的 LaTeX 公式渲染和编辑功能
- **用户权限**: 管理员、审核员、编辑角色分工

## 技术栈

- **前端**: Next.js 14 (App Router), React 19, Tailwind CSS, KaTeX
- **后端**: Next.js API Routes, Prisma ORM
- **数据库**: SQLite (开发) / PostgreSQL (生产)
- **认证**: NextAuth.js

## 快速开始

### 方式一：使用快速设置脚本（推荐）

**Unix/Linux/Git Bash:**
```bash
./setup-dev.sh
```

**Windows CMD:**
```cmd
setup-dev.bat
```

脚本会自动完成：
1. 检查 Node.js 环境
2. 安装 npm 依赖
3. 配置环境变量
4. 生成 Prisma Client

然后启动开发服务器：
```bash
npm run dev
```

### 方式二：手动设置

1. **克隆项目**
```bash
git clone https://github.com/zhanghhrr/olympic-math-bank.git
cd olympic-math-bank
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境变量**
```bash
cp .env.example .env.local
```

4. **生成 Prisma Client**
```bash
npx prisma generate
```

5. **启动开发服务器**
```bash
npm run dev
```

6. **访问系统**
打开 http://localhost:3000

## 默认账号

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 管理员 | admin@example.com | admin123 |
| 审核员 | reviewer@example.com | reviewer123 |
| 编辑 | editor@example.com | editor123 |

## 可用命令

```bash
npm run dev        # 启动开发服务器
npm run build      # 构建生产版本
npm run start      # 启动生产服务器
npm run seed       # 重新生成种子数据
npm run db:studio  # 打开 Prisma Studio
```

## 项目结构

```
olympic-math-bank/
├── app/                    # Next.js App Router
│   ├── api/               # API 路由
│   ├── dashboard/         # 管理后台页面
│   └── login/             # 登录页面
├── components/             # React 组件
│   ├── question/          # 题目相关组件
│   └── layout/            # 布局组件
├── lib/                   # 工具库
│   ├── db/                # Prisma 配置和数据库
│   └── ocr/               # OCR 识别逻辑
├── prisma/                # Prisma Schema
└── public/                # 静态资源
```

## 开发指南

### 添加新题目类型
1. 在 `prisma/schema.prisma` 中修改 `QuestionType` 枚举
2. 更新 `app/dashboard/questions/new/page.tsx` 中的表单

### 自定义知识标签
知识标签支持五级结构：
- 一级：模块（如：计算模块、几何模块）
- 二级：专题（如：整数、小数、分数）
- 三级：子专题（如：整数加减、整数乘除）
- 四级：知识点（如：整数加法运算）
- 五级：技能（如：加法横式、加法竖式）

## 部署

### Docker 部署（推荐用于生产）

```bash
docker-compose up -d
```

这将启动：
- PostgreSQL 数据库
- Redis 缓存
- MinIO 对象存储

### Vercel 部署

```bash
npm run build
```

然后将 `.next` 目录部署到 Vercel。

## 许可证

MIT License
