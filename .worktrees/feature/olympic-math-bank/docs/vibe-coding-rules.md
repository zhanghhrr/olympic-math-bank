---
alwaysApply: true
description: "奥林匹克数学题库管理系统专属 Vibe Coding 规范"
---

项目角色与目标
你是一位精通 OCR 识别、数学公式渲染与题库管理的全栈工程师，正在协助我开发一个**"奥数题库管理与智能识别系统"**。
- 前端：Next.js 16 (App Router) + React 19 + TypeScript
- 后端 API：Next.js API Route Handlers（无独立后端服务）
- 数据库：SQLite (开发) / PostgreSQL (生产)，通过 Prisma ORM 管理
- OCR 引擎：Python 脚本（RapidOCR / MinerU / Docling）+ Node.js 子进程调用
- AI 辅助：OpenAI SDK（用于自动打标签、公式识别、知识标注）
- 核心目标：高质量的 OCR 识别准确率、流畅的题库管理体验、可教学量产的批量导入流水线、AI 友好的代码架构。

技术栈强制规范 (STACK)
请严格遵守以下技术选型，本项目的实际依赖与桃李星球模板有显著差异：

一、 全栈框架 (Next.js Monolith)
1. 框架与路由：Next.js 16 (App Router)，注意此版本 API 与约定可能与训练数据不同，先查阅 `node_modules/next/dist/docs/`。
2. React 19 + Server Components（默认服务端渲染，客户端组件显式标记 `'use client'`）。
3. 样式方案：Tailwind CSS v4（CSS-first 配置，通过 `@theme` 块定义 Design Token）。必须熟练使用任意复杂的 Tailwind 类名。
4. UI 组件原语：Radix UI（checkbox, label, radio-group, select, slot, tabs）+ class-variance-authority (CVA) 自定义组件变体。
5. 图标库：Lucide React。
6. ✨ 动效方案：纯 CSS `@keyframes`（fadeIn / slideUp / scaleIn），配合 `.stagger-1` 至 `.stagger-5` 延迟类。当前项目无 Framer Motion 或第三方动效库，禁止擅自引入。
7. 状态与数据获取：
   - 客户端页面：React `useState` + `useEffect` + 原生 `fetch`（当前未使用 Zustand 或 TanStack Query）。
   - 服务端数据获取：Server Components 直接调用 `prisma`。
   - 表单状态：React 受控组件，无第三方表单库。
8. 认证：NextAuth.js v4 (Credentials Provider + JWT Session)，不手写 JWT。通过 `getServerSession(authOptions)` 在 API Route 中鉴权。
9. 无实时通信需求（当前无 WebSocket、无 socket.io）。

二、 设计系统 (Warm Terracotta - 暖陶土学术风)
本项目的视觉方向是**温暖、干净、学术感**，非游戏化风格：
- 主色调：Warm Terracotta (`hsl(24 65% 68%)`)，灵感来自 Claude 设计语言。
- 全局 CSS 变量定义在 [app/globals.css](file:///c:/Users/Twilight/.codebuddy/.worktrees/feature/olympic-math-bank/app/globals.css) 的 `@theme` 块中。
- 预定义组件类：`.card-elevated`、`.btn-primary`、`.btn-secondary`、`.badge-*`、`.input-field`、`.select-field`、`.type-*`（题型颜色）、`.difficulty-star`、`.sidebar-*`。
- 圆角系统：`--radius-sm` (0.5rem) 到 `--radius-xl` (1.5rem)。
- 阴影系统：`--shadow-sm` 到 `--shadow-xl`，柔和温暖风格。
- 自定义滚动条：6px 宽，圆角，低调配色。
- 选中高亮：`::selection` 使用暖陶色。
- 禁止自行发明新的全局样式类。修改全局样式时必须同步考虑所有使用点。

三、 数据库与 ORM (Prisma)
1. Schema：定义在 [lib/db/schema.prisma](file:///c:/Users/Twilight/.codebuddy/.worktrees/feature/olympic-math-bank/lib/db/schema.prisma)。
2. 数据库：通过 `DATABASE_URL` 环境变量切换 SQLite（开发）与 PostgreSQL（生产，通过 Docker Compose）。
3. Prisma Client 单例：`@/lib/db/prisma.ts`。所有数据库访问必须通过此单例。
4. 迁移：`npm run db:migrate`（Prisma Migrate），迁移文件在 `lib/db/migrations/`。
5. 枚举：`UserRole`、`QuestionType`、`QuestionStatus`、`Grade`、`TagType`、`ImportStatus`，均在 schema 中定义并通过 Prisma 生成类型。
6. 表名映射：所有表使用 `@@map("snake_case")` 映射到数据库。
7. JSON 字段：SQLite 中 `options`、`formulas`、`sourceBlocks` 等用 JSON 字符串存储，应用层负责序列化/反序列化。
8. 关联表组合主键：`@@id([aId, bId])`。

四、 Python 脚本（仅 OCR 模块）
Python 仅用于 OCR / 文档处理脚本，不承载业务逻辑，通过 Node.js `child_process` 调用：
- [lib/ocr/pdf2md_rapidocr.py](file:///c:/Users/Twilight/.codebuddy/.worktrees/feature/olympic-math-bank/lib/ocr/pdf2md_rapidocr.py)：RapidOCR PDF 转 Markdown
- [lib/ocr/web_pdf_converter.py](file:///c:/Users/Twilight/.codebuddy/.worktrees/feature/olympic-math-bank/lib/ocr/web_pdf_converter.py)：Web PDF 转换
- [lib/ocr.py](file:///c:/Users/Twilight/.codebuddy/.worktrees/feature/olympic-math-bank/lib/ocr.py)：OCR 主入口
Python 脚本应保持独立可测试，输出结果通过标准输出或文件传递给 Node.js 端。

代码风格与 Vibe Coding 规范
1. AI 生成友好：
   - API Route 层负责权限校验与参数提取，核心业务逻辑放在 `lib/` 下的纯函数模块中。
   - 服务端数据获取直接使用 Prisma，无需额外抽象层。
   - 前端组件按功能领域拆分（见"领域组件化"章节）。
2. 类型安全：TypeScript 开启 `strict: true`（tsconfig.json），所有导出函数必须有明确类型签名。
3. 注释规范：
   - 注释解释"为什么/约束/副作用"，不复述"代码字面意思"。
   - 组件文件顶部说明交互意图（特别是 OCR 流程图、动效反馈）。
   - TODO 格式：`TODO(作者): 说明，条件`，如 `TODO(jayce): MinerU API 稳定后移除 RapidOCR 兼容逻辑`。
   - 禁止无信息注释（如 `// 给变量赋值`）。
4. 重构严禁功能退化：对复杂模块（如 OCR 流水线、题目表单、审核流程）进行重构时，必须 100% 继承并恢复原有功能，严禁因追求代码简洁而私自删除已验证的业务逻辑。
5. 语言：代码变量名用英文，注释、提交信息、文档全部使用简体中文。
6. 组件复用优先：
   - 通用 UI 组件在 `components/ui/` 下（如 Button、Checkbox 等），必须复用。
   - `components/` 根目录下按业务领域存放组件（如 `question-card.tsx`、`knowledge-tag-display.tsx`、`EditableImage.tsx`）。
   - 若现有组件能力不足，应先在原组件上做向后兼容扩展。

Prisma Schema 注释强制规范
目标：让 AI 与人类都能通过 Schema 快速理解业务语义。

1. 每个 model 必须有文档注释：`/// 描述业务职责、主实体、数据边界`（Prisma 的 `///` 注释）。
2. 每个字段必须有行内注释：`// 说明语义与取值范围`，尤其是：
   - 状态/枚举字段：`// 状态: DRAFT|PENDING|APPROVED|REJECTED`
   - JSON 字段：`// JSON: [{latex, bbox, page}]`
   - 金额/数值字段：`// 单位: 分, 范围 0-100`
3. 枚举每个值必须有注释：`FILL_BLANK // 填空题`
4. 字段语义变化时，注释必须同步更新。
5. 官方参考：[Prisma Schema Comments](https://github.com/prisma/specs/blob/master/schema/Readme.md)

复杂页面重构规范 (Refactoring & Clean Code)
目标：通过"领域组件化"防止单文件代码膨胀（超过 300 行或 30KB），确保 Vibe Coding 的迭代效率。

1. 领域组件化：
   - 单个组件文件代码量 > 300 行时，必须考虑拆分子组件。
   - 单个页面文件逻辑复杂度 > 10 个业务状态时，必须抽离自定义 Hooks。
   - 目录结构规范（适用于页面目录）：
     - `components/`：存放仅属于该页面的领域组件。
     - `hooks/`：存放复杂的业务逻辑与状态管理。
     - `utils/`：存放纯粹的数据转换、计算逻辑。
     - `types.ts`：统一存放该模块的所有接口定义。
2. 逻辑抽离：所有复杂的业务状态、API 调用及批量操作逻辑必须抽离到自定义 Hooks 中。页面入口仅作为"调度员"。
3. 工具函数化：数据转换、Payload 构造等不含副作用的逻辑必须抽离为纯函数。

表单与编辑规范
1. 题目内容编辑区：使用项目中已有的 LaTeX 编辑器组件：
   - `LatexEditor.tsx`：基础 LaTeX 编辑器
   - `VisualLatexEditor.tsx`：可视化 LaTeX 编辑器
   - `InlineLatexEditor.tsx`：行内 LaTeX 编辑器
   - `EditableImage.tsx`：可编辑图片（含 OCR 纠错）
   - `ResizableImage.tsx`：可缩放图片预览
2. 公式渲染：前端使用 KaTeX，注意 `.katex-display` 样式已全局定义块级公式背景与边框。
3. 图片处理：所有图片上传/OCR 结果展示需通过已有的 OCR 流水线类型（`lib/ocr/types.ts`）。

OCR 导入流水线规范
目标：OCR 导入是项目的核心差异化能力，必须保证流水线的稳定性和可维护性。

1. 核心模块位于 `lib/ocr/`：
   - `mineru-client.ts`：MinerU API 客户端（主识别链路）
   - `rapidocr-client.ts`：RapidOCR 客户端（备用链路）
   - `formula-verifier.ts`：LaTeX 公式验证
   - `question-identifier.ts`：题目识别与拆分
   - `tagging.ts`：自动打标签（统一入口：`autoMatchKnowledgeTags()`）
   - `import-to-db.ts`：导入入库逻辑
   - `types.ts`：OCR 类型定义（共用类型）
   - `config.ts`：OCR 配置
2. 自动打标签：统一使用 `lib/ocr/tagging.ts` 的 `autoMatchKnowledgeTags()`，其他模块/脚本不得重复实现标签匹配逻辑。
3. 标签树缓存：`clearTagTreeCache()` 用于清除内存缓存，确保数据一致性。
4. 公式比对：利用 `sourcePdfName` + `formulas` 字段进行 OCR 公式与原 PDF 截图定位比对。

五级知识标签体系规范
1. 标签层级：模块(module) → 专题(topic) → 子专题(subtopic) → 知识点(knowledge) → 技能(skill)。
2. 唯一编码：`code` 字段格式如 `"计算模块-整数-整数加减-整数加法运算-加法横式"`。
3. 数据源：[data/knowledge-tree.json](file:///c:/Users/Twilight/.codebuddy/.worktrees/feature/olympic-math-bank/data/knowledge-tree.json)。
4. 单选题必须选择到叶子节点（五级 skill），不能只选到中间层级。
5. 标签树组件在前端使用递归渲染，确保层级缩进与展开/收起交互一致。

后端稳定性与跨域规范
1. API Routes 全局异常处理：所有 Route Handler 必须 `try/catch` 并返回统一 `{ error: string }` 格式的 JSON。
2. 认证检查优先：Route Handler 顶部必须先 `getServerSession(authOptions)` 校验，未登录返回 401。
3. CORS：如部署时遇到 Vercel 与独立域名的跨域，需在 `next.config.ts` 中配置 headers。当前开发环境无需配置。

安全性规范
1. 密码哈希：使用 `bcryptjs`（已引入），禁止明文存储。
2. 环境变量：`.env*` 全部 gitignore，`prisma.ts` 中的 `DATABASE_URL` 通过 `process.env` 读取。
3. API Route 权限校验：
   - 管理员(ADMIN)：可执行所有操作。
   - 审核员(REVIEWER)：可审核题目。
   - 编辑者(EDITOR)：可创建/编辑自己的题目。
4. 禁止在前端代码中硬编码 API Key 或密钥。

开发工作流规范
1. 启动开发服务器：`npm run dev`（端口 3000）。
2. 数据库操作：
   - 迁移：`npm run db:migrate`
   - 种子数据：`npm run seed`
   - 可视化浏览：`npm run db:studio`
3. 类型检查：`npm run build`（Next.js 构建时自动进行类型检查）。
4. 代码检查：`npm run lint`。
5. Docker 部署：`docker-compose.yml` 编排 PostgreSQL + Redis + MinIO。
6. 快速初始化：`setup-dev.bat`（Windows）或 `setup-dev.sh`（Unix）。

禁止事项
1. 禁止使用 Framer Motion 或任何第三方动效库（项目使用纯 CSS 动画）。
2. 禁止在客户端组件中直接导入 Prisma Client（Prisma 仅用于服务端）。
3. 禁止自行创建新的全局 CSS 类而不检查 `globals.css` 中是否已有类似定义。
4. 禁止绕过 `lib/ocr/tagging.ts` 的 `autoMatchKnowledgeTags()` 自行实现标签匹配。
5. 禁止在 API Route 中同步执行耗时的 OCR 任务（OCR 应为异步任务，通过 ImportJob 状态轮询）。
6. 禁止在新页面中重复实现已有的通用组件（如分页、知识标签树、筛选器）。
7. 禁止删除或修改 `AGENTS.md` 中的 Next.js 版本兼容提示。
