'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Eye, Filter, Clock } from 'lucide-react';
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
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED' | null>(null);

  useEffect(() => {
    fetchPendingQuestions();
  }, [filter]);

  const fetchPendingQuestions = async () => {
    try {
      const params = new URLSearchParams();
      params.append('status', 'PENDING');
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

  const handleReview = async (question: Question, action: 'APPROVED' | 'REJECTED') => {
    setSelectedQuestion(question);
    setReviewAction(action);
    setReviewComment('');
    setShowReviewModal(true);
  };

  const submitReview = async () => {
    if (!selectedQuestion || !reviewAction) return;

    try {
      const res = await fetch(`/api/questions/${selectedQuestion.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: reviewAction,
          comment: reviewComment,
        }),
      });

      if (res.ok) {
        setShowReviewModal(false);
        setSelectedQuestion(null);
        setReviewAction(null);
        setReviewComment('');
        fetchPendingQuestions();
      } else {
        const error = await res.json();
        alert(error.error || '审核失败');
      }
    } catch (error) {
      alert('审核出错');
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

      {/* 统计信息 */}
      <div className="bg-warning/10 border border-warning/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-warning" />
          <p className="text-foreground">
            待审核题目：<span className="font-bold text-lg">{questions.length}</span> 道
          </p>
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
        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="card-elevated p-6">
              <div className="flex items-start justify-between mb-4">
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
                      <span
                        key={t.tag.name}
                        className="badge badge-draft"
                      >
                        {t.tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-border">
                <Button
                  onClick={() => handleReview(q, 'APPROVED')}
                  className="bg-success hover:bg-success/90 text-white rounded-xl"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  通过
                </Button>
                <Button
                  onClick={() => handleReview(q, 'REJECTED')}
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
      )}

      {/* 审核模态框 */}
      {showReviewModal && selectedQuestion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-surface rounded-xl p-6 w-full max-w-lg shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              {reviewAction === 'APPROVED' ? '审核通过' : '审核拒绝'}
            </h3>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">题目预览：</p>
              <div className="bg-muted/50 p-3 rounded-xl text-sm line-clamp-3 text-foreground">
                {selectedQuestion.content}
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
                onClick={submitReview}
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
    </div>
  );
}
