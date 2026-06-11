'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileImage, FileText, Loader2, CheckCircle, AlertCircle, Tag, FileCheck, Brain, XCircle, FileType } from 'lucide-react';
import { QuestionCard } from '@/components/question/question-card';
import { BatchTagDialog } from '@/components/knowledge-tag/batch-dialog';

interface QuestionPreview {
  id: string;
  content: string;
  answer: string;
  solution: string | null;
  type: string;
  difficulty: number;
  status: string;
  grade: string;
  source: string;
  pages?: number[];
  matchedTags: Array<{
    id: string;
    name: string;
    path: string;
    score?: number;
    matchSource?: string;
  }>;
}

interface ImportPreviewResult {
  success: boolean;
  message: string;
  total?: number;
  questions: QuestionPreview[];
  importResult?: {
    successCount: number;
    failedCount: number;
  };
}

type ImportStage = 'uploading' | 'ocr' | 'splitting' | 'tagging' | 'preview' | 'completed' | 'error';

const stageInfo: Record<ImportStage, { label: string; description: string; icon: React.ReactNode }> = {
  uploading: { label: '上传文件', description: '正在上传PDF文件到服务器...', icon: <Upload className="w-4 h-4" /> },
  ocr: { label: 'OCR识别', description: '使用MinerU进行PDF文字识别...', icon: <FileText className="w-4 h-4" /> },
  splitting: { label: '题目分割', description: '智能识别并分割题目内容...', icon: <FileCheck className="w-4 h-4" /> },
  tagging: { label: '标签匹配', description: '根据内容自动匹配知识标签...', icon: <Brain className="w-4 h-4" /> },
  preview: { label: '预览编辑', description: '请核对题目内容，可手动调整标签', icon: <Tag className="w-4 h-4" /> },
  completed: { label: '完成', description: '导入完成！', icon: <CheckCircle className="w-4 h-4 text-success" /> },
  error: { label: '错误', description: '导入过程中出现错误', icon: <AlertCircle className="w-4 h-4 text-error" /> },
};

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<'image' | 'pdf' | 'docx'>('pdf');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [currentStage, setCurrentStage] = useState<ImportStage>('uploading');
  const [stageProgress, setStageProgress] = useState(0);
  const [result, setResult] = useState<ImportPreviewResult | null>(null);
  const [autoMatchTags, setAutoMatchTags] = useState(true);
  const [selectedGrade, setSelectedGrade] = useState('P3');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [asyncMode, setAsyncMode] = useState(true);

  // 预览模式状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<QuestionPreview[]>([]);
  const [showBatchTagDialog, setShowBatchTagDialog] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [undoTimer, setUndoTimer] = useState<number>(0);
  const [undoJobItems, setUndoJobItems] = useState<string[]>([]);

  // 撤销倒计时
  useEffect(() => {
    if (undoTimer <= 0) {
      if (undoTimer === 0 && undoJobItems.length > 0) {
        setUndoJobItems([]);
      }
      return;
    }
    const timer = setTimeout(() => setUndoTimer(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [undoTimer, undoJobItems.length]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setResult(null);
      setQuestions([]);
      setSelectedIds(new Set());
      setPdfUrl(null);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setStageProgress(0);
    setResult(null);
    setQuestions([]);
    setSelectedIds(new Set());

    const formData = new FormData();

    if (activeTab === 'pdf' || activeTab === 'image' || activeTab === 'docx') {
      // PDF / 图片 / DOCX 统一走 OCR 智能导入流水线
      setCurrentStage('uploading');

      if (asyncMode) {
        // 异步模式：立即返回 jobId，后台处理
        formData.append('file', files[0]);

        try {
          const res = await fetch('/api/import/ocr/async', {
            method: 'POST',
            body: formData,
          });
          const data = await res.json();
          if (res.ok && data.jobId) {
            setPdfUrl(data.pdfUrl || null);
            // 轮询任务状态
            let pollCount = 0;
            let consecutiveFailures = 0;
            const MAX_POLLS = 100;
            const MAX_CONSECUTIVE_FAILURES = 3;

            const pollInterval = setInterval(async () => {
              try {
                pollCount++;
                const statusRes = await fetch(`/api/import/ocr/async?jobId=${data.jobId}`);
                const statusData = await statusRes.json();
                consecutiveFailures = 0;

                if (statusData.status === 'COMPLETED') {
                  clearInterval(pollInterval);
                  setUploading(false);
                  setCurrentStage('preview');
                  setQuestions(statusData.questions || []);
                  setResult({
                    success: true,
                    message: 'OCR 识别完成',
                    questions: statusData.questions || [],
                  });
                  setStageProgress(100);
                } else if (statusData.status === 'FAILED') {
                  clearInterval(pollInterval);
                  setUploading(false);
                  setCurrentStage('error');
                  setResult({
                    success: false,
                    message: statusData.errorMessage || 'OCR 识别失败',
                    questions: [],
                  });
                } else {
                  if (pollCount >= MAX_POLLS) {
                    clearInterval(pollInterval);
                    setUploading(false);
                    setCurrentStage('error');
                    setResult({ success: false, message: '处理超时，请稍后重试', questions: [] });
                    return;
                  }
                  const total = statusData.totalItems || 0;
                  const processed = statusData.processedItems || 0;
                  if (total > 0) {
                    setCurrentStage('tagging');
                    if (processed >= total) {
                      setStageProgress(95);
                    } else {
                      setStageProgress(60 + Math.round((processed / total) * 35));
                    }
                  } else {
                    setCurrentStage('ocr');
                    setStageProgress(prev => Math.min(prev + 1, 55));
                  }
                }
              } catch {
                consecutiveFailures++;
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                  clearInterval(pollInterval);
                  setUploading(false);
                  setCurrentStage('error');
                  setResult({ success: false, message: '查询任务状态连续失败，请检查网络后重试', questions: [] });
                }
              }
            }, 3000);
            setCurrentStage('ocr');
            setStageProgress(5);
          } else {
            setUploading(false);
            setCurrentStage('error');
            setResult({ success: false, message: data.error || '创建异步任务失败', questions: [] });
          }
        } catch (error) {
          setCurrentStage('error');
          setUploading(false);
          setResult({ success: false, message: '网络错误，请重试', questions: [] });
        }
        return;
      }

      // 同步模式
      formData.append('file', files[0]);
      formData.append('autoMatchTags', autoMatchTags.toString());
      formData.append('grade', selectedGrade);
      setStageProgress(10);

      try {
        const res = await fetch('/api/import/ocr', {
          method: 'POST',
          body: formData,
        });
        setStageProgress(100);

        const data = await res.json();

        if (res.ok) {
          setCurrentStage('preview');
          setQuestions(data.questions || []);
          setPdfUrl(data.pdfUrl || null);
          setResult({
            success: true,
            message: data.message,
            total: data.total,
            questions: data.questions || [],
            importResult: data.importResult,
          });
        } else {
          setCurrentStage('error');
          setResult({
            success: false,
            message: data.error || '导入失败',
            questions: [],
          });
        }
      } catch (error) {
        setCurrentStage('error');
        setResult({
          success: false,
          message: '网络错误，请重试',
          questions: [],
        });
      }
    }

    setUploading(false);
  };

  // 选中/取消选中题目
  const handleSelect = (id: string, selected: boolean) => {
    const newSelected = new Set(selectedIds);
    if (selected) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedIds.size === questions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(questions.map(q => q.id)));
    }
  };

  // 更新单个题目
  const handleUpdateQuestion = async (id: string, data: Partial<QuestionPreview>) => {
    try {
      const res = await fetch('/api/questions/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id], data }),
      });

      if (res.ok) {
        setQuestions(prev =>
          prev.map(q =>
            q.id === id
              ? {
                  ...q,
                  ...data,
                  matchedTags: data.matchedTags !== undefined ? data.matchedTags : q.matchedTags,
                }
              : q
          )
        );
      }
    } catch (error) {
      console.error('更新题目失败:', error);
    }
  };

  // 移除题目标签
  const handleRemoveTag = async (questionId: string, tagId: string) => {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    const newTags = question.matchedTags.filter(t => t.id !== tagId);
    await handleUpdateQuestion(questionId, { matchedTags: newTags });
  };

  // 批量打标签
  const handleBatchTag = async (tagId: string | null) => {
    if (!tagId || selectedIds.size === 0) return;

    try {
      const res = await fetch('/api/questions/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          data: { knowledgeTagId: tagId },
        }),
      });

      if (res.ok) {
        setQuestions(prev =>
          prev.map(q =>
            selectedIds.has(q.id)
              ? {
                  ...q,
                  matchedTags: [{ id: tagId, name: '已选标签', path: '' }],
                }
              : q
          )
        );
        setSelectedIds(new Set());
        setShowBatchTagDialog(false);
      }
    } catch (error) {
      console.error('批量打标签失败:', error);
    }
  };

  // 确认导入
  const handleConfirmImport = async () => {
    if (questions.length === 0) return;

    setConfirming(true);
    try {
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: questions.map(q => ({
            content: q.content,
            answer: q.answer,
            solution: q.solution || '',
            type: q.type,
            difficulty: q.difficulty,
            grade: q.grade,
            source: q.source,
            matchedTags: q.matchedTags,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentStage('completed');
        setResult({
          success: true,
          message: `成功将 ${questions.length} 道题目设为待审核状态`,
          total: questions.length,
          questions: [],
        });

        // 5 秒撤销机制
        if (data.importedIds && data.importedIds.length > 0) {
          setUndoJobItems(data.importedIds);
          setUndoTimer(5);
        }
      } else {
        const data = await res.json();
        alert(data.error || '确认导入失败');
      }
    } catch (error) {
      console.error('确认导入失败:', error);
      alert('确认导入失败');
    }
    setConfirming(false);
  };

  // 撤销导入
  const handleUndoImport = async () => {
    if (undoJobItems.length === 0) return;
    try {
      await fetch('/api/questions/batch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: undoJobItems }),
      });
      setUndoJobItems([]);
      setUndoTimer(0);
      setResult({ success: true, message: '已撤销导入，题目已删除', total: 0, questions: [] });
    } catch {
      alert('撤销失败，请手动删除');
    }
  };

  // 重新上传：回到初始文件选择状态
  const handleReUpload = () => {
    setCurrentStage('uploading');
    setFiles([]);
    setResult(null);
    setQuestions([]);
    setSelectedIds(new Set());
    setPdfUrl(null);
    setStageProgress(0);
  };

  return (
    <div className="space-y-6 h-[calc(100vh-120px)] overflow-y-auto pb-8 animate-fade-in">
      <h2 className="text-2xl font-semibold text-foreground tracking-tight">导入题目</h2>

      <div className="flex gap-6 border-b border-border">
        <button
          onClick={() => {
            setActiveTab('pdf');
            setFiles([]);
            setResult(null);
            setQuestions([]);
            setSelectedIds(new Set());
          }}
          className={`px-4 py-3 font-medium transition-colors ${
            activeTab === 'pdf'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="w-4 h-4 inline mr-2" />
          PDF智能导入
        </button>
        <button
          onClick={() => {
            setActiveTab('image');
            setFiles([]);
            setResult(null);
            setQuestions([]);
            setSelectedIds(new Set());
          }}
          className={`px-4 py-3 font-medium transition-colors ${
            activeTab === 'image'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileImage className="w-4 h-4 inline mr-2" />
          图片导入
        </button>
        <button
          onClick={() => {
            setActiveTab('docx');
            setFiles([]);
            setResult(null);
            setQuestions([]);
            setSelectedIds(new Set());
          }}
          className={`px-4 py-3 font-medium transition-colors ${
            activeTab === 'docx'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileType className="w-4 h-4 inline mr-2" />
          Word导入
        </button>
      </div>

      {/* 导入选项（所有格式通用） */}
      <div className="bg-primary/5 p-5 rounded-xl border border-primary/10 space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4 text-primary" />
            <span className="font-medium text-foreground">导入选项</span>
          </div>

          {/* 年级选择 */}
          <div className="space-y-2">
            <label className="text-sm text-foreground font-medium">题目年级：</label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="input-field"
            >
              <option value="P1">一年级</option>
              <option value="P2">二年级</option>
              <option value="P3">三年级</option>
              <option value="P4">四年级</option>
              <option value="P5">五年级</option>
              <option value="P6">六年级</option>
            </select>
          </div>

          {/* 自动标签匹配 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoMatchTags}
              onChange={(e) => setAutoMatchTags(e.target.checked)}
              className="w-4 h-4 rounded text-primary"
            />
            <span className="text-sm text-foreground">
              根据题目内容自动匹配知识标签（推荐开启）
            </span>
          </label>

          {/* 异步模式切换 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={asyncMode}
              onChange={(e) => setAsyncMode(e.target.checked)}
              className="w-4 h-4 rounded text-primary"
            />
            <span className="text-sm text-foreground">
              后台异步处理（适合大文件，不阻塞操作）
            </span>
          </label>
        </div>



      <div className="card-elevated p-6">
        {/* 上传状态 */}
        {currentStage !== 'preview' && (
          <div className="border-2 border-dashed border-border rounded-xl p-12 text-center">
            <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-foreground mb-4">
              {activeTab === 'image'
                ? '选择图片文件（支持 JPG、PNG、WebP）'
                : activeTab === 'docx'
                  ? '选择 Word 文档（支持 .docx / .doc）'
                  : '选择 PDF 文件（系统会自动识别题目并打标签）'}
            </p>
            <input
              type="file"
              accept={
                activeTab === 'image' ? 'image/*' :
                activeTab === 'docx' ? '.docx,.doc' :
                '.pdf'
              }
              onChange={handleFileSelect}
              className="hidden"
              id="file-input"
            />
            <label htmlFor="file-input">
              <Button variant="outline" className="cursor-pointer border-border hover:bg-muted rounded-xl" asChild>
                <span>选择文件</span>
              </Button>
            </label>
          </div>
        )}

        {files.length > 0 && currentStage !== 'preview' && (
          <div className="mt-6">
            <h3 className="font-medium text-foreground mb-2">已选择文件：</h3>
            <ul className="space-y-2">
              {files.map((file, index) => (
                <li key={index} className="flex items-center gap-2 text-sm">
                  <span className="text-foreground">{file.name}</span>
                  <span className="text-muted-foreground">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </li>
              ))}
            </ul>

            {uploading && activeTab !== 'image' && (
              <div className="mt-6 space-y-4">
                {/* 进度条 */}
                <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ${
                      currentStage === 'error' ? 'bg-error' : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min(stageProgress, 100)}%` }}
                  />
                </div>

                {/* 当前阶段 - 动态展示实时进度 */}
                <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <div className="text-primary">
                    {stageInfo[currentStage].icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-foreground">
                      {stageInfo[currentStage].label}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {currentStage === 'ocr'
                        ? '正在调用 MinerU API 进行文字识别与题目分割...'
                        : currentStage === 'tagging'
                          ? `正在匹配知识标签...`
                          : stageInfo[currentStage].description}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-primary">
                      {Math.round(Math.min(stageProgress, 100))}%
                    </div>
                    {currentStage === 'tagging' && (
                      <div className="text-xs text-muted-foreground">
                        标签匹配中
                      </div>
                    )}
                  </div>
                </div>

                {/* 处理流程步骤指示器 */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  {[
                    { key: 'uploading', label: '上传' },
                    { key: 'ocr', label: 'OCR识别' },
                    { key: 'splitting', label: '题目分割' },
                    { key: 'tagging', label: '标签匹配' },
                    { key: 'preview', label: '预览编辑' },
                  ].map((step, idx) => {
                    const stageOrder = ['uploading', 'ocr', 'ocr', 'tagging', 'preview'];
                    const currentIdx = stageOrder.indexOf(currentStage);
                    const isActive = idx <= currentIdx;
                    const isCurrent = (currentStage === 'ocr' && (idx === 1 || idx === 2)) || stageOrder[idx] === currentStage;
                    return (
                      <div key={step.key} className="flex items-center gap-1">
                        <div className={`w-2.5 h-2.5 rounded-full transition-colors ${
                          isCurrent ? 'bg-primary animate-pulse' : isActive ? 'bg-primary/60' : 'bg-muted-foreground/30'
                        }`} />
                        <span className={isCurrent ? 'text-primary font-medium' : ''}>
                          {step.label}
                        </span>
                        {idx < 4 && <div className={`w-6 h-px ${isActive ? 'bg-primary/40' : 'bg-muted-foreground/20'}`} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button onClick={handleUpload} disabled={uploading} className="bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl">
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {activeTab === 'docx' ? '智能导入中...' : activeTab === 'image' ? '智能识别中...' : '智能导入中...'}
                  </>
                ) : (
                  '开始智能导入'
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setFiles([]);
                  setResult(null);
                  setStageProgress(0);
                  setQuestions([]);
                  setSelectedIds(new Set());
                }}
                disabled={uploading}
                className="border-border hover:bg-muted rounded-xl"
              >
                清除
              </Button>
            </div>
          </div>
        )}

        {/* 题目预览列表 - 分栏布局 */}
        {currentStage === 'preview' && questions.length > 0 && (
          <div className="mt-4 flex gap-4" style={{ height: 'calc(100vh - 260px)' }}>
            {/* 左侧：PDF 预览 */}
            {pdfUrl && (
              <div className="w-[45%] shrink-0 border border-border rounded-xl overflow-hidden bg-muted/10 flex flex-col">
                <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center justify-between shrink-0">
                  <h3 className="text-sm font-medium text-foreground">PDF 原文预览</h3>
                </div>
                <iframe
                  src={pdfUrl}
                  className="w-full flex-1"
                  title="PDF预览"
                />
              </div>
            )}

            {/* 右侧：题目列表 + 批量操作 */}
            <div className={`${pdfUrl ? 'flex-1' : 'w-full'} flex flex-col`} style={{ minWidth: 0 }}>
              {/* 批量操作工具栏 */}
              <div className="bg-muted/50 p-3 rounded-xl border border-border flex items-center justify-between shrink-0 mb-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === questions.length && questions.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded text-primary"
                    />
                    <span className="text-sm text-foreground">
                      全选 ({selectedIds.size}/{questions.length})
                    </span>
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBatchTagDialog(true)}
                    disabled={selectedIds.size === 0}
                    className="border-border hover:bg-muted rounded-xl"
                  >
                    <Tag className="w-4 h-4 mr-1" />
                    批量打标签
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    共 {questions.length} 道
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReUpload}
                    className="border-border hover:bg-muted rounded-xl"
                  >
                    重新上传
                  </Button>
                  <Button
                    onClick={handleConfirmImport}
                    disabled={confirming}
                    className="bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl"
                  >
                    {confirming ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        导入中...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        确认导入
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* 题目卡片列表 */}
              <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                {questions.map((question, idx) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    isSelected={selectedIds.has(question.id)}
                    onSelect={handleSelect}
                    onUpdate={handleUpdateQuestion}
                    onRemoveTag={handleRemoveTag}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 导入结果（非预览模式） */}
        {result && currentStage !== 'preview' && (
          <div className={`mt-6 p-4 rounded-xl border ${
            result.success ? 'bg-success/10 border-success/20' : 'bg-error/10 border-error/20'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-success" />
              ) : (
                <AlertCircle className="w-5 h-5 text-error" />
              )}
              <span className={`font-medium ${result.success ? 'text-success' : 'text-error'}`}>
                {result.message}
              </span>
            </div>

            {result.success && result.total !== undefined && (
              <div className="text-sm text-foreground mb-4">
                <p>总题目数: {result.total}</p>
                <p className="text-success">成功: {result.importResult?.successCount}</p>
                {result.importResult?.failedCount && result.importResult.failedCount > 0 && (
                  <p className="text-error">失败: {result.importResult.failedCount}</p>
                )}
              </div>
            )}

            {/* 操作按钮 */}
            {currentStage === 'completed' && (
              <div className="mt-4 flex gap-2">
                {undoTimer > 0 && (
                  <Button
                    size="sm"
                    onClick={handleUndoImport}
                    className="bg-error hover:bg-error/90 text-white rounded-xl"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    撤销导入 ({undoTimer}s)
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('/dashboard/questions', '_blank')}
                  className="border-border hover:bg-muted rounded-xl"
                >
                  查看所有题目
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReUpload}
                  className="border-border hover:bg-muted rounded-xl"
                >
                  继续导入
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 批量打标签弹窗 */}
      <BatchTagDialog
        isOpen={showBatchTagDialog}
        onClose={() => setShowBatchTagDialog(false)}
        onConfirm={handleBatchTag}
      />

      {currentStage !== 'preview' && (
      <div className="bg-muted/50 p-5 rounded-xl border border-border text-sm text-foreground">
        <h3 className="font-medium text-foreground mb-2">使用说明：</h3>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          {activeTab === 'pdf' ? (
            <>
              <li><strong>PDF智能导入</strong>：上传PDF后系统自动进行OCR识别、题目分割和标签匹配</li>
              <li>支持多页PDF，系统会智能识别并分割每道题目</li>
              <li>自动根据题目内容匹配五级知识标签（模块→专题→子专题→知识点→技能）</li>
              <li><strong>预览编辑</strong>：识别后您可以手动调整标签、修改题目内容，确认无误后点击"确认导入"</li>
              <li>建议PDF清晰，文字内容完整可见，处理时间约30秒-2分钟</li>
            </>
          ) : activeTab === 'docx' ? (
            <>
              <li><strong>Word智能导入</strong>：上传 .docx / .doc 文件，系统自动转换为 PDF 后进行 OCR 识别</li>
              <li>支持包含公式、表格的 Word 文档（需服务器已安装 LibreOffice 以进行格式转换）</li>
              <li>自动根据题目内容匹配五级知识标签（模块→专题→子专题→知识点→技能）</li>
              <li><strong>预览编辑</strong>：识别后您可以手动调整标签、修改题目内容，确认无误后点击"确认导入"</li>
              <li>若未安装 LibreOffice，将尝试直接提交 DOCX 到 MinerU 识别引擎</li>
            </>
          ) : (
            <>
              <li><strong>图片导入</strong>：上传题目图片，系统自动进行 OCR 识别、题目识别和标签匹配</li>
              <li>支持 JPG、PNG、WebP 格式，建议图片清晰、文字完整可见</li>
              <li>自动根据题目内容匹配五级知识标签（模块→专题→子专题→知识点→技能）</li>
              <li><strong>预览编辑</strong>：识别后您可以手动调整标签、修改题目内容，确认无误后点击"确认导入"</li>
              <li>处理时间约 30 秒 - 2 分钟，取决于图片大小和 MinerU API 负载</li>
            </>
          )}
        </ul>
      </div>
      )}
    </div>
  );
}
