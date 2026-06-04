# 奥数题库系统 - 题目筛选与 PDF 导出功能 PRD

## 1. 需求背景与目标
随着题库中题目的不断增加（通过 MinerU 导入及手动录入），教研人员和老师需要一种高效的方式来检索特定题目，并能够将选中的题目组装成试卷或讲义，导出为 PDF 格式用于线下打印和教学。
**核心目标**：
1. 实现多维度的题目快速筛选与精准检索。
2. 实现“选题加入组卷车”的交互流。
3. 支持将选中的题目导出为排版精美、支持 LaTeX 公式的 PDF（支持教师版/学生版）。

## 2. 用户场景
*   **场景 A（精准找题）**：教研老师在准备下周的“三年级几何题”讲义，需要在题库中筛选出“难度为困难”、“题型为解答题”、且知识点标签包含“图形面积”的所有已审核题目。
*   **场景 B（组卷打印）**：老师挑选了 10 道题，想要生成一份课后作业。需要导出一份“学生版”（只有题目和留白）用于发给学生，以及一份“教师版”（包含答案和详细解析）用于自己备课。

## 3. 功能详细说明

### 3.1 题库多维筛选模块 (Filter Panel)
在后台管理系统 (`app/dashboard/questions`) 的题目列表上方增加筛选区。
**支持的筛选字段**：
*   **搜索框 (Search)**：支持对“题干”和“解析”进行全文关键字搜索。
*   **知识标签 (Tags)**：支持 5 级知识树的级联选择（Cascading Select）或多选。
*   **题型 (Type)**：单选/多选（填空、选择、解答、计算）。
*   **难度 (Difficulty)**：单选/多选（例如：基础、中等、困难、竞赛）。
*   **状态 (Status)**：单选（待审核、已发布、退回等）。
*   **来源/年份 (Source/Year)**：下拉选择。

*交互说明*：筛选条件变更时，列表无刷新自动更新（建议利用 Next.js 14 的 URL Query Params 配合 Server Components 实现，方便分享当前筛选链接）。

### 3.2 组卷购物车模块 (Question Cart)
*   **勾选功能**：题目列表中每一项增加 Checkbox。
*   **悬浮操作栏 (Floating Action Bar)**：当有题目被选中时，底部或侧边弹出悬浮栏，显示“已选 X 道题”。
*   **操作按钮**：
    *   `清空已选`
    *   `生成 PDF试卷`

### 3.3 PDF 导出/打印模块 (PDF Generation)
点击“生成 PDF试卷”后，进入组卷预览页。
**配置选项**：
*   **试卷标题 (Title)**：自定义输入（如：三年级春季第十二周测试）。
*   **副标题 (Subtitle)**：自定义输入（如：考试时间 60 分钟）。
*   **排版模式 (Mode)**：
    1.  **学生版**：仅显示题号、题干、选项（如果是选择题）。解答/计算题自动在题目下方留出固定高度的空白作答区。
    2.  **教师版**：显示题目，并在紧接着的下方高亮显示“答案”和“解析”。
*   **页面设置 (Layout)**：单栏排版 / 双栏排版（试卷常用）。

**导出机制**：
*   在前端渲染一个专用的纯净页面（无侧边栏、无导航），利用浏览器的 `@media print` 样式进行精确的分页控制。
*   用户点击“导出”，调用浏览器的打印功能 (`window.print()`)，用户选择“另存为 PDF”即可。这种方式对 LaTeX 公式的渲染兼容性最好，且开发成本最低。

## 4. 技术实现建议 (Tech Spec)

### 4.1 筛选展示 (Frontend & Backend)
*   **前端**：使用 `nuqs` 库或原生的 `useSearchParams` 将筛选状态同步到 URL。
*   **后端**：在 Prisma 中构建动态的 `where` 查询条件。
    ```typescript
    // 示例 Prisma 查询逻辑
    const questions = await prisma.question.findMany({
      where: {
        AND: [
          type ? { type: type } : {},
          difficulty ? { difficulty: difficulty } : {},
          tagId ? { tags: { some: { id: tagId } } } : {},
          keyword ? { content: { contains: keyword } } : {}
        ]
      },
      // ...
    });
    ```

### 4.2 状态管理 (State Management)
*   使用 `zustand` 创建一个 `usePaperCartStore`，用于在不同页面间（列表页 <-> 预览页）持久化存储用户选中的题目 ID 列表。

### 4.3 PDF 排版与打印 (CSS Print)
*   创建一个专属的路由 `app/dashboard/print/page.tsx`。
*   核心 CSS 控制：
    ```css
    @media print {
      @page { size: A4; margin: 15mm; }
      body { -webkit-print-color-adjust: exact; }
      .no-print { display: none; }
      .page-break-inside-avoid { page-break-inside: avoid; } /* 确保题目不会被从中间截断 */
    }
    ```

## 5. 阶段划分与排期 (Milestones)
*   **Phase 1 (基础筛选与展示)**：完成题库列表的 UI 改造，实现 Prisma 的多维动态查询，支持按题型、难度、状态、关键词筛选。
*   **Phase 2 (组卷车与高级标签)**：引入全局状态管理实现题目勾选；实现 5 级知识树标签的筛选。
*   **Phase 3 (排版与导出)**：实现独立的试卷预览页，编写专门的 Print CSS，实现学生版/教师版的切换和原生导出。
