'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileImage, FileText, Loader2, CheckCircle, AlertCircle, Tag, FileCheck, Brain } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'image' | 'pdf'>('pdf');
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

    if (activeTab === 'pdf') {
      setCurrentStage('uploading');

      if (asyncMode) {
        // 异步模式：立即返回 jobId，后台处理
        const formData = new FormData();
        formData.append('file', files[0]);

        try {
          const res = await fetch('/api/import/ocr/async', {
            method: 'POST',
            body: formData,
          });
          const data = await res.json();
          if (res.ok && data.jobId) {
            setPdfUrl(data.pdfUrl || null);
            // 开始轮询任务状态
            const pollInterval = setInterval(async () => {
              try {
                const statusRes = await fetch(`/api/import/ocr/async?jobId=${data.jobId}`);
                const statusData = await statusRes.json();
                if (statusData.status === 'COMPLETED') {
                  clearInterval(pollInterval);
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
                  setCurrentStage('error');
                  setResult({
                    success: false,
                    message: statusData.errorMessage || 'OCR 识别失败',
                    questions: [],
                  });
                } else {
                  setStageProgress(prev => Math.min(prev + 5, 90));
                }
              } catch {
                clearInterval(pollInterval);
                setCurrentStage('error');
                setResult({ success: false, message: '查询任务状态失败', questions: [] });
              }
            }, 3000);
            setStageProgress(20);
          } else {
            setCurrentStage('error');
            setResult({ success: false, message: data.error || '创建异步任务失败', questions: [] });
          }
        } catch (error) {
          setCurrentStage('error');
          setResult({ success: false, message: '网络错误，请重试', questions: [] });
        }
        setUploading(false);
        return;
      }

      formData.append('file', files[0]);
      formData.append('autoMatchTags', autoMatchTags.toString());
      formData.append('grade', selectedGrade);

      // 模拟进度更新
      const progressInterval = setInterval(() => {
        setStageProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 15;
        });
      }, 800);

      try {
        const res = await fetch('/api/import/ocr', {
          method: 'POST',
          body: formData,
        });

        clearInterval(progressInterval);
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
        clearInterval(progressInterval);
        setCurrentStage('error');
        setResult({
          success: false,
          message: '网络错误，请重试',
          questions: [],
        });
      }
    } else {
      // 图片导入（原有逻辑）
      files.forEach(file => formData.append('files', file));
      formData.append('type', activeTab);

      try {
        const res = await fetch('/api/import', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          setResult({
            success: true,
            message: '上传成功！请在导入任务页面查看进度',
            questions: [],
          });
          setFiles([]);
        } else {
          setResult({
            success: false,
            message: '上传失败',
            questions: [],
          });
        }
      } catch (error) {
        setResult({
          success: false,
          message: '上传出错',
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
  const handleBatchTag = async (tagIds: string[]) => {
    if (selectedIds.size === 0) return;

    try {
      const res = await fetch('/api/questions/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          data: { knowledgeTagIds: tagIds },
        }),
      });

      if (res.ok) {
        setQuestions(prev =>
          prev.map(q =>
            selectedIds.has(q.id)
              ? {
                  ...q,
                  matchedTags: tagIds.map(id => ({ id, name: '已选标签', path: '' })),
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
        setCurrentStage('completed');
        setResult({
          success: true,
          message: `成功将 ${questions.length} 道题目设为待审核状态`,
          total: questions.length,
          questions: [],
        });
        setQuestions([]);
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

  // 返回预览模式
  const handleBackToPreview = () => {
    setCurrentStage('preview');
    setFiles([]);
    setResult(null);
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
      </div>

      {/* PDF导入选项 */}
      {activeTab === 'pdf' && (
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
      )}

      {/* 预览模式 - 批量操作工具栏 */}
      {currentStage === 'preview' && questions.length > 0 && (
        <div className="bg-muted/50 p-4 rounded-xl border border-border flex items-center justify-between">
          <div className="flex items-center gap-4">
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
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              共 {questions.length} 道题目待确认
            </span>
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
      )}

      <div className="card-elevated p-6">
        {/* 上传状态 */}
        {currentStage !== 'preview' && (
          <div className="border-2 border-dashed border-border rounded-xl p-12 text-center">
            <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-foreground mb-4">
              {activeTab === 'image'
                ? '选择图片文件（支持 JPG、PNG）'
                : '选择 PDF 文件（系统会自动识别题目并打标签）'}
            </p>
            <input
              type="file"
              accept={activeTab === 'image' ? 'image/*' : '.pdf'}
              multiple={activeTab === 'image'}
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

        {files.length > 0 && (
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

            {uploading && activeTab === 'pdf' && (
              <div className="mt-6 space-y-4">
                {/* 进度条 */}
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(stageProgress, 100)}%` }}
                  />
                </div>

                {/* 当前阶段 */}
                <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-xl border border-primary/10">
                  <div className="text-primary">
                    {stageInfo[currentStage].icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-foreground">
                      {stageInfo[currentStage].label}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {stageInfo[currentStage].description}
                    </div>
                  </div>
                  <div className="text-sm text-primary font-medium">
                    {Math.round(Math.min(stageProgress, 100))}%
                  </div>
                </div>

                {/* 处理流程说明 */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>处理流程：上传 → OCR识别 → 题目分割 → 标签匹配 → 预览编辑</p>
                  <p>根据PDF页数和题目数量，处理时间可能需要 30秒-2分钟</p>
                </div>
              </div>
            )}

            {uploading && activeTab === 'image' && (
              <div className="mt-4">
                <div className="flex items-center gap-2 text-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在上传图片，请稍候...</span>
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button onClick={handleUpload} disabled={uploading} className="bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl">
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {activeTab === 'pdf' ? '智能导入中...' : '上传中...'}
                  </>
                ) : (
                  activeTab === 'pdf' ? '开始智能导入' : '开始上传'
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
          <div className="mt-6 flex gap-4" style={{ minHeight: '600px' }}>
            {/* 左侧：PDF 预览 */}
            {pdfUrl && (
              <div className="w-[45%] shrink-0 border border-border rounded-xl overflow-hidden bg-muted/10">
                <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">PDF 原文预览</h3>
                </div>
                <iframe
                  src={pdfUrl}
                  className="w-full"
                  style={{ height: '600px' }}
                  title="PDF预览"
                />
              </div>
            )}

            {/* 右侧：题目列表 */}
            <div className={`${pdfUrl ? 'flex-1' : 'w-full'} space-y-3`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-foreground">题目预览（共 {questions.length} 道）</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackToPreview}
                  className="border-border hover:bg-muted rounded-xl"
                >
                  重新上传
                </Button>
              </div>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
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
                  onClick={handleBackToPreview}
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
          ) : (
            <>
              <li><strong>图片导入</strong>：支持批量上传多个题目图片</li>
              <li>上传后系统会进行OCR识别，请在识别结果页面核对</li>
              <li>建议图片清晰，文字内容完整可见</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
