'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileImage, FileText, Loader2, CheckCircle, AlertCircle, Tag, FileCheck, Brain } from 'lucide-react';

interface ImportResult {
  success: boolean;
  message: string;
  total?: number;
  successCount?: number;
  failedCount?: number;
  questions?: Array<{
    success: boolean;
    questionId?: string;
    matchedTags?: string[];
    matchedTagDetails?: Array<{
      id: string;
      name: string;
      path: string;
    }>;
    error?: string;
  }>;
}

type ImportStage = 'uploading' | 'ocr' | 'splitting' | 'tagging' | 'importing' | 'completed' | 'error';

const stageInfo: Record<ImportStage, { label: string; description: string; icon: React.ReactNode }> = {
  uploading: { label: '上传文件', description: '正在上传PDF文件到服务器...', icon: <Upload className="w-4 h-4" /> },
  ocr: { label: 'OCR识别', description: '使用MinerU进行PDF文字识别...', icon: <FileText className="w-4 h-4" /> },
  splitting: { label: '题目分割', description: '智能识别并分割题目内容...', icon: <FileCheck className="w-4 h-4" /> },
  tagging: { label: '标签匹配', description: '根据内容自动匹配知识标签...', icon: <Brain className="w-4 h-4" /> },
  importing: { label: '导入数据库', description: '将题目保存到数据库...', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  completed: { label: '完成', description: '导入完成！', icon: <CheckCircle className="w-4 h-4 text-green-500" /> },
  error: { label: '错误', description: '导入过程中出现错误', icon: <AlertCircle className="w-4 h-4 text-red-500" /> },
};

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<'image' | 'pdf'>('pdf');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [currentStage, setCurrentStage] = useState<ImportStage>('uploading');
  const [stageProgress, setStageProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [autoMatchTags, setAutoMatchTags] = useState(true);
  const [selectedGrade, setSelectedGrade] = useState('P3');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setStageProgress(0);
    setResult(null);

    const formData = new FormData();

    if (activeTab === 'pdf') {
      // PDF OCR导入 - 模拟进度显示
      setCurrentStage('uploading');

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
          setCurrentStage('completed');
          setResult({
            success: true,
            message: data.message,
            total: data.total,
            successCount: data.successCount,
            failedCount: data.failedCount,
            questions: data.questions
          });
        } else {
          setCurrentStage('error');
          setResult({
            success: false,
            message: data.error || '导入失败',
          });
        }
      } catch (error) {
        clearInterval(progressInterval);
        setCurrentStage('error');
        setResult({
          success: false,
          message: '网络错误，请重试',
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
          });
          setFiles([]);
        } else {
          setResult({
            success: false,
            message: '上传失败',
          });
        }
      } catch (error) {
        setResult({
          success: false,
          message: '上传出错',
        });
      }
    }

    setUploading(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">导入题目</h2>

      <div className="flex gap-4 border-b">
        <button
          onClick={() => {
            setActiveTab('pdf');
            setFiles([]);
            setResult(null);
          }}
          className={`px-4 py-2 font-medium ${
            activeTab === 'pdf'
              ? 'border-b-2 border-slate-900 text-slate-900'
              : 'text-slate-500'
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
          className={`px-4 py-2 font-medium ${
            activeTab === 'image'
              ? 'border-b-2 border-slate-900 text-slate-900'
              : 'text-slate-500'
          }`}
        >
          <FileImage className="w-4 h-4 inline mr-2" />
          图片导入
        </button>
      </div>

      {/* PDF导入选项 */}
      {activeTab === 'pdf' && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4 text-blue-600" />
            <span className="font-medium text-blue-900">导入选项</span>
          </div>

          {/* 年级选择 */}
          <div className="space-y-2">
            <label className="text-sm text-blue-800 font-medium">题目年级：</label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="w-full p-2 border border-blue-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-blue-800">
              根据题目内容自动匹配知识标签（推荐开启）
            </span>
          </label>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg border">
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center">
          <Upload className="w-12 h-12 mx-auto text-slate-400 mb-4" />
          <p className="text-slate-600 mb-4">
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
            <Button variant="outline" className="cursor-pointer" asChild>
              <span>选择文件</span>
            </Button>
          </label>
        </div>

        {files.length > 0 && (
          <div className="mt-6">
            <h3 className="font-medium mb-2">已选择文件：</h3>
            <ul className="space-y-2">
              {files.map((file, index) => (
                <li key={index} className="flex items-center gap-2 text-sm">
                  <span className="text-slate-600">{file.name}</span>
                  <span className="text-slate-400">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </li>
              ))}
            </ul>

            {uploading && activeTab === 'pdf' && (
              <div className="mt-6 space-y-4">
                {/* 进度条 */}
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(stageProgress, 100)}%` }}
                  />
                </div>

                {/* 当前阶段 */}
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="text-blue-600">
                    {stageInfo[currentStage].icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-blue-900">
                      {stageInfo[currentStage].label}
                    </div>
                    <div className="text-sm text-blue-700">
                      {stageInfo[currentStage].description}
                    </div>
                  </div>
                  <div className="text-sm text-blue-600 font-medium">
                    {Math.round(Math.min(stageProgress, 100))}%
                  </div>
                </div>

                {/* 处理流程说明 */}
                <div className="text-xs text-slate-500 space-y-1">
                  <p>处理流程：上传 → OCR识别 → 题目分割 → 标签匹配 → 导入数据库</p>
                  <p>根据PDF页数和题目数量，处理时间可能需要 30秒-2分钟</p>
                </div>
              </div>
            )}

            {uploading && activeTab === 'image' && (
              <div className="mt-4">
                <div className="flex items-center gap-2 text-slate-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在上传图片，请稍候...</span>
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button onClick={handleUpload} disabled={uploading}>
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
                }}
                disabled={uploading}
              >
                清除
              </Button>
            </div>
          </div>
        )}

        {/* 导入结果 */}
        {result && (
          <div className={`mt-6 p-4 rounded-lg border ${
            result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              <span className={`font-medium ${result.success ? 'text-green-900' : 'text-red-900'}`}>
                {result.message}
              </span>
            </div>

            {result.success && result.total !== undefined && (
              <div className="text-sm text-slate-600 mb-4">
                <p>总题目数: {result.total}</p>
                <p className="text-green-600">成功导入: {result.successCount}</p>
                {result.failedCount && result.failedCount > 0 && (
                  <p className="text-red-600">失败: {result.failedCount}</p>
                )}
              </div>
            )}

            {/* 显示匹配的标签 */}
            {result.success && result.questions && result.questions.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-slate-800 mb-2">题目导入详情：</h4>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {result.questions.filter(q => q.success).map((q, idx) => (
                    <div key={idx} className="bg-white p-3 rounded border text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-700">题目 {idx + 1}</span>
                          {q.questionId && (
                            <a
                              href={`/questions/${q.questionId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-xs"
                            >
                              查看详情
                            </a>
                          )}
                        </div>
                        {q.matchedTagDetails && q.matchedTagDetails.length > 0 ? (
                          <span className="text-green-600 text-xs bg-green-50 px-2 py-0.5 rounded">
                            已匹配 {q.matchedTagDetails.length} 个标签
                          </span>
                        ) : (
                          <span className="text-amber-600 text-xs bg-amber-50 px-2 py-0.5 rounded">
                            未匹配到标签
                          </span>
                        )}
                      </div>
                      {q.matchedTagDetails && q.matchedTagDetails.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {q.matchedTagDetails.map((tag, tidx) => (
                            <span
                              key={tidx}
                              className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs cursor-help"
                              title={tag.path}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 显示失败的题目 */}
                  {result.questions.filter(q => !q.success).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-red-200">
                      <h5 className="font-medium text-red-700 mb-2">
                        导入失败的题目 ({result.questions.filter(q => !q.success).length}道)
                      </h5>
                      {result.questions.filter(q => !q.success).map((q, idx) => (
                        <div key={`fail-${idx}`} className="bg-red-50 p-2 rounded text-xs text-red-700 mb-1">
                          题目 {idx + 1}: {q.error || '未知错误'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('/dashboard/questions', '_blank')}
                  >
                    查看所有题目
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFiles([]);
                      setResult(null);
                      setStageProgress(0);
                    }}
                  >
                    继续导入
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-slate-50 p-4 rounded-lg text-sm text-slate-600">
        <h3 className="font-medium mb-2">使用说明：</h3>
        <ul className="list-disc list-inside space-y-1">
          {activeTab === 'pdf' ? (
            <>
              <li><strong>PDF智能导入</strong>：上传PDF后系统自动进行OCR识别、题目分割和标签匹配</li>
              <li>支持多页PDF，系统会智能识别并分割每道题目</li>
              <li>自动根据题目内容匹配五级知识标签（模块→专题→子专题→知识点→技能）</li>
              <li>识别后的题目会先保存为草稿状态，可在题目列表中编辑完善</li>
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
