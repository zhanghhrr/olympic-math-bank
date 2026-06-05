'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { QuestionContent } from '@/components/QuestionContent';

interface Question {
  id: string;
  content: string;
  answer: string;
  solution: string | null;
  type: string;
  grade: string;
  difficulty: number;
  status: string;
  createdBy: { name: string };
  tags: { tag: { name: string } }[];
  createdAt: string;
}

// 题目类型 - 限定为四类
const typeLabels: Record<string, string> = {
  FILL_BLANK: '填空题',
  CHOICE: '选择题',
  SOLUTION: '解答题',
  CALCULATION: '计算题',
};

const gradeLabels: Record<string, string> = {
  P1: '一年级',
  P2: '二年级',
  P3: '三年级',
  P4: '四年级',
  P5: '五年级',
  P6: '六年级',
};

export default function ReviewPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ grade: '', type: '' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);

  // 单题审核模态框
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [modalQuestion, setModalQuestion] = useState<Question | null>(null);
  const [reviewComment, setReviewComment] = useState('');

  // 批量审核模态框
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchAction, setBatchAction] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [batchComment, setBatchComment] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [batchStats, setBatchStats] = useState({ todayApproved: 0, todayRejected: 0, totalReviewed: 0 });

  useEffect(() => {
    fetchPendingQuestions();
    fetchStats();
  }, [filter]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showReviewModal || showBatchModal) return; // 模态框中不触发
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return; // 输入框中不触发

      switch (e.key.toLowerCase()) {
        case 'a':
          e.preventDefault();
          if (questions.length > 0) {
            setModalQuestion(questions[currentIndex]);
            setReviewAction('APPROVED');
            setReviewComment('');
            setShowReviewModal(true);
          }
          break;
        case 'r':
          e.preventDefault();
          if (questions.length > 0) {
            setModalQuestion(questions[currentIndex]);
            setReviewAction('REJECTED');
            setReviewComment('');
            setShowReviewModal(true);
          }
          break;
        case 'n':
          e.preventDefault();
          if (currentIndex < questions.length - 1) setCurrentIndex(currentIndex + 1);
          break;
        case 'escape':
          setShowReviewModal(false);
          setShowBatchModal(false);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showReviewModal, showBatchModal, questions, currentIndex]);

  const fetchPendingQuestions = async () => {
    try {
      const params = new URLSearchParams();
      params.append('status', 'PENDING');
      params.append('limit', '100');
      if (filter.grade) params.append('grade', filter.grade);
      if (filter.type) params.append('type', filter.type);

      const res = await fetch(`/api/questions?${params}`);
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch (error) {
      console.error('Failed to fetch questions:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载今日审核统计
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setBatchStats({
        todayApproved: data.todayReviewed || 0,
        todayRejected: data.todayRejected || 0,
        totalReviewed: (data.todayReviewed || 0) + (data.todayRejected || 0),
      });
    } catch {
      // stats API 不可用时静默降级
    }
  };

  // 多选
  const handleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === questions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(questions.map(q => q.id)));
    }
  };

  // 单题审核
  const handleSingleReview = (question: Question, action: 'APPROVED' | 'REJECTED') => {
    setModalQuestion(question);
    setReviewAction(action);
    setReviewComment('');
    setShowReviewModal(true);
  };

  const submitSingleReview = async () => {
    if (!modalQuestion || !reviewAction) return;

    try {
      const res = await fetch(`/api/questions/${modalQuestion.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: reviewAction, comment: reviewComment }),
      });

      if (res.ok) {
        setShowReviewModal(false);
        setModalQuestion(null);
        setReviewAction(null);
        setReviewComment('');
        fetchPendingQuestions();
      } else {
        const error = await res.json();
        alert(error.error || '审核失败');
      }
    } catch {
      alert('审核出错');
    }
  };

  // 批量审核
  const handleBatchReview = (action: 'APPROVED' | 'REJECTED') => {
    if (selectedIds.size === 0) return;
    setBatchAction(action);
    setBatchComment('');
    setShowBatchModal(true);
  };

  const submitBatchReview = async () => {
    if (!batchAction || selectedIds.size === 0) return;
    setReviewing(true);

    try {
      const ids = Array.from(selectedIds);
      let successCount = 0;
      let failCount = 0;

      for (const id of ids) {
        try {
          const res = await fetch(`/api/questions/${id}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: batchAction, comment: batchComment }),
          });
          if (res.ok) successCount++;
          else failCount++;
        } catch {
          failCount++;
        }
      }

      setShowBatchModal(false);
      setSelectedIds(new Set());
      fetchPendingQuestions();
      alert(`批量审核完成：成功 ${successCount} 道，失败 ${failCount} 道`);
    } finally {
      setReviewing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 animate-fade-in">
        <h2 className="text-2xl font-semibold text-foreground tracking-tight mb-6">审核中心</h2>
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-foreground tracking-tight">审核中心</h2>
        <div className="flex gap-3">
          <select
            value={filter.grade}
            onChange={(e) => setFilter({ ...filter, grade: e.target.value })}
            className="input-field w-32"
          >
            <option value="">所有年级</option>
            <option value="P1">一年级</option>
            <option value="P2">二年级</option>
            <option value="P3">三年级</option>
            <option value="P4">四年级</option>
            <option value="P5">五年级</option>
            <option value="P6">六年级</option>
          </select>
          <select
            value={filter.type}
            onChange={(e) => setFilter({ ...filter, type: e.target.value })}
            className="input-field w-32"
          >
            <option value="">所有题型</option>
            <option value="FILL_BLANK">填空题</option>
            <option value="CHOICE">选择题</option>
            <option value="SOLUTION">解答题</option>
            <option value="CALCULATION">计算题</option>
          </select>
        </div>
      </div>

      {/* 统计信息 + 批量操作栏 */}
      <div className="bg-warning/10 border border-warning/20 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-warning" />
            <p className="text-foreground">
              待审核题目：<span className="font-bold text-lg">{questions.length}</span> 道
            </p>
            {selectedIds.size > 0 && (
              <span className="text-sm text-muted-foreground ml-4">
                已选 <span className="font-bold text-primary">{selectedIds.size}</span> 道
              </span>
            )}
          </div>

          {/* 批量操作按钮 */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => handleBatchReview('APPROVED')}
                className="bg-success hover:bg-success/90 text-white rounded-xl"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                批量通过 ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBatchReview('REJECTED')}
                className="text-error border-error/30 hover:bg-error/5 rounded-xl"
              >
                <XCircle className="w-4 h-4 mr-1" />
                批量拒绝
              </Button>
            </div>
          )}
        </div>

        {/* 统计面板 */}
        <div className="mt-3 pt-3 border-t border-warning/20 grid grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{questions.length}</p>
            <p className="text-xs text-muted-foreground">待审核</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-success">{batchStats.todayApproved}</p>
            <p className="text-xs text-muted-foreground">今日通过</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-error">{batchStats.todayRejected}</p>
            <p className="text-xs text-muted-foreground">今日拒绝</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">
              {batchStats.totalReviewed > 0 
                ? `${Math.round(batchStats.todayApproved / batchStats.totalReviewed * 100)}%`
                : '-'}
            </p>
            <p className="text-xs text-muted-foreground">通过率</p>
          </div>
        </div>
      </div>

      {/* 题目列表 */}
      {questions.length === 0 ? (
        <div className="text-center py-12 card-elevated">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-success/10 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <p className="text-foreground">暂无待审核题目</p>
        </div>
      ) : (
        <>
          {/* 全选栏 */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={selectedIds.size === questions.length && questions.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded text-primary"
              />
              全选 ({selectedIds.size}/{questions.length})
            </label>
          </div>

          <div className="space-y-4">
            {questions.map((q) => (
              <div key={q.id} className={`card-elevated p-6 transition-all ${selectedIds.has(q.id) ? 'ring-2 ring-primary' : ''}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(q.id)}
                      onChange={() => handleSelect(q.id)}
                      className="w-4 h-4 rounded text-primary"
                    />
                    <div className="flex gap-2">
                      <span className="badge type-choice">
                        {gradeLabels[q.grade] || q.grade}
                      </span>
                      <span className="badge badge-draft">
                        {typeLabels[q.type] || q.type}
                      </span>
                      <span className="badge bg-warning/10 text-warning">
                        {'★'.repeat(q.difficulty)}
                      </span>
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    创建人：{q.createdBy.name} | {new Date(q.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="mb-4">
                  <h3 className="font-medium text-foreground mb-2">题目内容：</h3>
                  <QuestionContent content={q.content} className="bg-muted/50 p-4 rounded-xl" />
                </div>

                <div className="mb-4">
                  <h3 className="font-medium text-foreground mb-2">答案：</h3>
                  <QuestionContent content={q.answer} className="bg-muted/50 p-4 rounded-xl" />
                </div>

                {q.solution && (
                  <div className="mb-4">
                    <h3 className="font-medium text-foreground mb-2">详细解答：</h3>
                    <QuestionContent content={q.solution} className="bg-muted/50 p-4 rounded-xl" />
                  </div>
                )}

                {q.tags.length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-medium text-foreground mb-2">标签：</h3>
                    <div className="flex gap-2">
                      {q.tags.map((t) => (
                        <span key={t.tag.name} className="badge badge-draft">
                          {t.tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-border">
                  <Button
                    onClick={() => handleSingleReview(q, 'APPROVED')}
                    className="bg-success hover:bg-success/90 text-white rounded-xl"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    通过
                  </Button>
                  <Button
                    onClick={() => handleSingleReview(q, 'REJECTED')}
                    variant="outline"
                    className="text-error border-error/30 hover:bg-error/5 rounded-xl"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    拒绝
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 单题审核模态框 */}
      {showReviewModal && modalQuestion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-surface rounded-xl p-6 w-full max-w-lg shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              {reviewAction === 'APPROVED' ? '审核通过' : '审核拒绝'}
            </h3>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">题目预览：</p>
              <div className="bg-muted/50 p-3 rounded-xl text-sm line-clamp-3 text-foreground">
                {modalQuestion.content}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                审核意见（可选）
              </label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={3}
                className="input-field"
                placeholder={reviewAction === 'APPROVED' ? '可选：填写通过说明' : '请填写拒绝原因'}
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={submitSingleReview}
                className={reviewAction === 'APPROVED' ? 'bg-success hover:bg-success/90 text-white rounded-xl' : 'bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl'}
              >
                确认{reviewAction === 'APPROVED' ? '通过' : '拒绝'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowReviewModal(false)}
                className="border-border hover:bg-muted rounded-xl"
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 批量审核模态框 */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-surface rounded-xl p-6 w-full max-w-lg shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              {batchAction === 'APPROVED' ? '批量审核通过' : '批量审核拒绝'}
            </h3>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">
                将对选中的 <span className="font-bold text-primary">{selectedIds.size}</span> 道题目执行{batchAction === 'APPROVED' ? '通过' : '拒绝'}操作
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                批量审核意见（可选）
              </label>
              <textarea
                value={batchComment}
                onChange={(e) => setBatchComment(e.target.value)}
                rows={3}
                className="input-field"
                placeholder={batchAction === 'APPROVED' ? '可选：填写批量通过说明' : '请填写批量拒绝原因'}
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={submitBatchReview}
                disabled={reviewing}
                className={batchAction === 'APPROVED' ? 'bg-success hover:bg-success/90 text-white rounded-xl' : 'bg-error hover:bg-error/90 text-white rounded-xl'}
              >
                {reviewing ? '处理中...' : `确认批量${batchAction === 'APPROVED' ? '通过' : '拒绝'}`}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowBatchModal(false)}
                className="border-border hover:bg-muted rounded-xl"
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
