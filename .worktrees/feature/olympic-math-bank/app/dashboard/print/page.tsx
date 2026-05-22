'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Settings2, BookOpen, GraduationCap, Plus, ArrowUp, ArrowDown, Trash2, Heading1, Heading2, SplitSquareHorizontal, Layers } from 'lucide-react';
import { QuestionContent } from '@/components/QuestionContent';

interface Question {
  id: string;
  content: string;
  answer: string;
  solution: string | null;
  type: string;
  options?: string;
}

type BlockType = 'MAIN_TITLE' | 'SUB_TITLE' | 'QUESTION' | 'PAGE_BREAK';

interface DocumentBlock {
  id: string;
  type: BlockType;
  content?: string;
  question?: Question;
}

function PrintPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [blocks, setBlocks] = useState<DocumentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 试卷配置状态
  const [mode, setMode] = useState<'student' | 'teacher'>('student');
  const [showConfig, setShowConfig] = useState(true);

  useEffect(() => {
    const fetchQuestions = async () => {
      const idsParam = searchParams.get('ids');
      if (!idsParam) {
        setLoading(false);
        return;
      }

      const ids = idsParam.split(',');
      try {
        const fetchedQuestions = [];
        for (const id of ids) {
          const res = await fetch(`/api/questions/${id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.question) {
              fetchedQuestions.push(data.question);
            }
          }
        }
        
        // 初始化块结构
        const initialBlocks: DocumentBlock[] = [
          { id: `t1_${Date.now()}`, type: 'MAIN_TITLE', content: '奥林匹克数学训练讲义' },
          { id: `t2_${Date.now()}`, type: 'SUB_TITLE', content: '考试时间：60分钟   满分：100分   姓名：________' }
        ];
        fetchedQuestions.forEach((q, index) => {
          initialBlocks.push({ id: `q_${q.id}_${index}`, type: 'QUESTION', question: q });
        });
        setBlocks(initialBlocks);
        
      } catch (error) {
        console.error('Failed to fetch selected questions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [searchParams]);

  const handlePrint = () => {
    setShowConfig(false);
    // 等待 React 重新渲染隐藏配置面板后，调用系统打印
    setTimeout(() => {
      window.print();
      // 打印完成后恢复配置面板显示
      setTimeout(() => setShowConfig(true), 500);
    }, 100);
  };

  const addBlock = (index: number, type: BlockType) => {
    const newBlock: DocumentBlock = {
      id: `b_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      content: type === 'MAIN_TITLE' ? '请输入大标题' : type === 'SUB_TITLE' ? '请输入小标题' : ''
    };
    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    setBlocks(newBlocks);
  };

  const removeBlock = (index: number) => {
    const newBlocks = [...blocks];
    newBlocks.splice(index, 1);
    setBlocks(newBlocks);
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const newBlocks = [...blocks];
      [newBlocks[index - 1], newBlocks[index]] = [newBlocks[index], newBlocks[index - 1]];
      setBlocks(newBlocks);
    } else if (direction === 'down' && index < blocks.length - 1) {
      const newBlocks = [...blocks];
      [newBlocks[index], newBlocks[index + 1]] = [newBlocks[index + 1], newBlocks[index]];
      setBlocks(newBlocks);
    }
  };

  const updateBlockContent = (index: number, content: string) => {
    const newBlocks = [...blocks];
    newBlocks[index].content = content;
    setBlocks(newBlocks);
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">正在加载试卷数据...</div>;
  }

  if (blocks.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-muted-foreground">没有加载到试卷数据</p>
        <Button onClick={() => router.back()} variant="outline">返回题库</Button>
      </div>
    );
  }

  // 计算提纲数据
  let questionCount = 0;
  let pageCount = 1;

  return (
    <div className="h-full overflow-y-auto bg-muted/20 pb-20 print-reset-h">
      {/* 侧边排版总览 (打印时隐藏) */}
      <div className="fixed left-0 top-0 h-full w-60 bg-surface border-r border-border flex flex-col no-print z-40">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground tracking-tight">排版总览</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {blocks.map((block) => {
            if (block.type === 'QUESTION') questionCount++;
            if (block.type === 'PAGE_BREAK') pageCount++;
            
            const scrollToBlock = () => {
              const el = document.getElementById(`block-${block.id}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            };

            return (
              <div 
                key={`outline-${block.id}`}
                onClick={scrollToBlock}
                className="px-3 py-2 text-sm rounded-lg hover:bg-muted cursor-pointer transition-colors flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                {block.type === 'MAIN_TITLE' && <Heading1 className="w-4 h-4 text-blue-500 shrink-0" />}
                {block.type === 'SUB_TITLE' && <Heading2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                {block.type === 'QUESTION' && <BookOpen className="w-4 h-4 text-orange-500 shrink-0" />}
                {block.type === 'PAGE_BREAK' && <SplitSquareHorizontal className="w-4 h-4 text-purple-500 shrink-0" />}
                
                <span className="truncate flex-1">
                  {block.type === 'MAIN_TITLE' && (block.content || '未命名大标题')}
                  {block.type === 'SUB_TITLE' && (block.content || '未命名小标题')}
                  {block.type === 'QUESTION' && `第 ${questionCount} 题`}
                  {block.type === 'PAGE_BREAK' && `--- 分页符 (第 ${pageCount} 页) ---`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 打印专用的全局 CSS，定义出版级 A4 与出血线 */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          /* 覆盖父级元素的固定高度和隐藏溢出，防止打印时内容被截断 */
          .print-reset-h, .print-reset-h * {
             height: auto !important;
             overflow: visible !important;
             max-height: none !important;
          }
          
          @page {
            size: A4;
            /* 出版级预留边距：顶部 25mm，底部 20mm，左右 20mm (含出血线预留) */
            margin: 25mm 20mm 20mm 20mm; 
          }
          body {
            background-color: white;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          /* 防止题目被从中截断 */
          .avoid-break {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          /* 强制分页符 */
          .page-break-after {
            page-break-after: always;
            break-after: page;
          }
          /* 确保打印时背景色/边框可见 */
          .teacher-answer-box {
            border: 1px solid #e2e8f0 !important;
            background-color: #f8fafc !important;
          }
        }
        /* 屏幕上的 A4 纸张模拟预览 */
        .a4-preview {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background: white;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
          /* 预览模式下的内边距，模拟打印页边距 */
          padding: 25mm 20mm 20mm 20mm;
        }
        
        .block-hover-group:hover .block-actions {
          opacity: 1;
        }
      `}} />

      {/* 顶部悬浮配置栏 (打印时隐藏) */}
      {showConfig && (
        <div className="sticky top-0 z-50 bg-surface border-b border-border shadow-sm p-4 no-print flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              排版与打印设置
            </h1>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex bg-muted p-1 rounded-lg">
              <button
                onClick={() => setMode('student')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === 'student' ? 'bg-surface text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                学生版 (留白作答)
              </button>
              <button
                onClick={() => setMode('teacher')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === 'teacher' ? 'bg-surface text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                教师版 (含解析)
              </button>
            </div>
            
            <Button onClick={handlePrint} className="bg-primary hover:bg-primary-hover">
              <Printer className="w-4 h-4 mr-2" />
              打印 / 导出 PDF
            </Button>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto mt-8 relative">
        {/* 配置表单 (打印时隐藏) */}
        {showConfig && (
          <div className="mb-6 bg-surface p-6 rounded-xl border border-border shadow-sm no-print">
            <div className="p-3 bg-blue-50 text-blue-800 text-sm rounded-lg border border-blue-100 flex items-start gap-2">
              <div className="font-bold">提示:</div>
              <div>此页面已按照出版级 A4 尺寸排版，并预留了出血线空间。后续你可以在这里叠加专属边框模板。请在弹出的系统打印窗口中将【纸张尺寸】设为 A4，并【取消勾选】页眉和页脚。<br />鼠标悬浮在每块内容上可进行上下移动或删除；在下方可以点击图标插入标题或手动分页符。</div>
            </div>
          </div>
        )}

        {/* 试卷真实预览区 (A4 模拟) */}
        <div className="a4-preview relative">
          {/* 占位：后续边框模板可绝对定位在此处 */}
          {/* <div className="absolute inset-0 border-[3px] border-double border-gray-800 m-8 pointer-events-none z-0"></div> */}

          <div className="relative z-10">
            {blocks.map((block, index) => (
              <div 
                id={`block-${block.id}`}
                key={block.id} 
                className={`relative group block-hover-group ${block.type === 'PAGE_BREAK' ? 'page-break-after my-8 border-b-2 border-dashed border-blue-300' : 'mb-6 avoid-break text-black'}`}
              >
                {/* 悬浮操作栏 */}
                {showConfig && (
                  <div className="absolute -left-12 top-0 opacity-0 transition-opacity duration-200 flex flex-col gap-1 bg-white shadow-md border border-slate-200 rounded-md p-1 z-50 block-actions no-print">
                    <button onClick={() => moveBlock(index, 'up')} disabled={index === 0} className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                    <button onClick={() => moveBlock(index, 'down')} disabled={index === blocks.length - 1} className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                    <button onClick={() => removeBlock(index)} className="p-1 hover:bg-red-50 text-red-500 rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
                
                {/* 插入块操作栏 */}
                {showConfig && (
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 opacity-0 transition-opacity duration-200 flex gap-1 bg-white shadow-md border border-slate-200 rounded-full p-1 z-50 block-actions no-print">
                    <button onClick={() => addBlock(index, 'MAIN_TITLE')} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-600" title="插入大标题"><Heading1 className="w-4 h-4" /></button>
                    <button onClick={() => addBlock(index, 'SUB_TITLE')} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-600" title="插入小标题"><Heading2 className="w-4 h-4" /></button>
                    <button onClick={() => addBlock(index, 'PAGE_BREAK')} className="p-1.5 hover:bg-slate-100 rounded-full text-blue-600" title="插入分页符"><SplitSquareHorizontal className="w-4 h-4" /></button>
                  </div>
                )}

                {/* 块内容渲染 */}
                {block.type === 'MAIN_TITLE' && (
                  <div className="text-center py-4">
                    {showConfig ? (
                      <input 
                        type="text" 
                        value={block.content || ''} 
                        onChange={(e) => updateBlockContent(index, e.target.value)}
                        className="text-3xl font-black text-black text-center w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none tracking-wider transition-colors" 
                        style={{ fontFamily: '"SimHei", "黑体", sans-serif' }}
                        placeholder="请输入大标题"
                      />
                    ) : (
                      <h1 className="text-3xl font-black text-black tracking-wider" style={{ fontFamily: '"SimHei", "黑体", sans-serif' }}>{block.content}</h1>
                    )}
                  </div>
                )}

                {block.type === 'SUB_TITLE' && (
                  <div className="text-center py-2">
                    {showConfig ? (
                      <input 
                        type="text" 
                        value={block.content || ''} 
                        onChange={(e) => updateBlockContent(index, e.target.value)}
                        className="text-base text-gray-800 text-center w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none transition-colors" 
                        style={{ fontFamily: '"KaiTi", "楷体", sans-serif' }}
                        placeholder="请输入小标题/考试信息"
                      />
                    ) : (
                      <p className="text-base text-gray-800" style={{ fontFamily: '"KaiTi", "楷体", sans-serif' }}>{block.content}</p>
                    )}
                  </div>
                )}

                {block.type === 'QUESTION' && block.question && (
                  <div className="py-2">
                    {/* 题干区域 */}
                    <div className="flex items-start gap-2 text-base leading-loose">
                      <span className="font-bold whitespace-nowrap mt-1">
                        {/* 题目序号计算：统计当前及之前的 QUESTION 块数量 */}
                        {blocks.slice(0, index + 1).filter(b => b.type === 'QUESTION').length}.
                      </span>
                      <div className="flex-1">
                        <QuestionContent content={block.question.content} className="text-black" />
                      </div>
                    </div>

                    {/* 学生版：留白作答区 */}
                    {mode === 'student' && (
                      <div className={`w-full mt-4 ${block.question.type === 'SOLUTION' || block.question.type === 'CALCULATION' ? 'h-48' : 'h-12'}`}>
                        {/* 解答题和计算题留出较大空白，填空选择题留小空白 */}
                      </div>
                    )}

                    {/* 教师版：显示答案和解析 */}
                    {mode === 'teacher' && (
                      <div className="mt-4 ml-6 p-4 rounded-lg teacher-answer-box bg-slate-50 border border-slate-200">
                        <div className="mb-3">
                          <span className="inline-block px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded mr-2">答案</span>
                          <QuestionContent content={block.question.answer || '略'} className="inline-block" />
                        </div>
                        {block.question.solution && (
                          <div>
                            <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded mr-2 mb-2">解析</span>
                            <QuestionContent content={block.question.solution} className="text-sm text-slate-700 leading-relaxed" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {block.type === 'PAGE_BREAK' && (
                  <div className="text-center py-2 text-blue-300 text-xs tracking-widest no-print select-none">
                    --- 手动分页符 ---
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 试卷尾部标识 */}
          <div className="mt-12 pt-4 border-t border-dashed border-gray-400 text-center text-xs text-gray-500 avoid-break relative z-10">
            - 第 {showConfig ? '?' : 'X'} 页 / 共 {showConfig ? '?' : 'Y'} 页 -
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrintPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">加载排版引擎中...</div>}>
      <PrintPageContent />
    </Suspense>
  );
}
