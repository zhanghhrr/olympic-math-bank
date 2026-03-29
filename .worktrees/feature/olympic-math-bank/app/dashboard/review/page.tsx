'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Eye, Filter } from 'lucide-react';

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
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-6">审核中心</h2>
        <div className="text-center py-12 text-slate-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">审核中心</h2>
        <div className="flex gap-4">
          <select
            value={filter.grade}
            onChange={(e) => setFilter({ ...filter, grade: e.target.value })}
            className="px-3 py-2 border rounded-md"
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
            className="px-3 py-2 border rounded-md"
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
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-yellow-800">
          待审核题目：<span className="font-bold text-lg">{questions.length}</span> 道
        </p>
      </div>

      {/* 题目列表 */}
      {questions.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-white rounded-lg border">
          <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
          <p>暂无待审核题目</p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="bg-white rounded-lg border p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                    {gradeLabels[q.grade] || q.grade}
                  </span>
                  <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded-full">
                    {typeLabels[q.type] || q.type}
                  </span>
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                    {'★'.repeat(q.difficulty)}
                  </span>
                </div>
                <span className="text-sm text-slate-500">
                  创建人：{q.createdBy.name} | {new Date(q.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="mb-4">
                <h3 className="font-medium mb-2">题目内容：</h3>
                <div className="bg-slate-50 p-4 rounded-lg whitespace-pre-wrap">
                  {q.content}
                </div>
              </div>

              <div className="mb-4">
                <h3 className="font-medium mb-2">答案：</h3>
                <div className="bg-slate-50 p-4 rounded-lg">
                  {q.answer}
                </div>
              </div>

              {q.solution && (
                <div className="mb-4">
                  <h3 className="font-medium mb-2">详细解答：</h3>
                  <div className="bg-slate-50 p-4 rounded-lg whitespace-pre-wrap">
                    {q.solution}
                  </div>
                </div>
              )}

              {q.tags.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-medium mb-2">标签：</h3>
                  <div className="flex gap-2">
                    {q.tags.map((t) => (
                      <span
                        key={t.tag.name}
                        className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full"
                      >
                        {t.tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={() => handleReview(q, 'APPROVED')}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  通过
                </Button>
                <Button
                  onClick={() => handleReview(q, 'REJECTED')}
                  variant="outline"
                  className="text-red-600 border-red-600 hover:bg-red-50"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold mb-4">
              {reviewAction === 'APPROVED' ? '审核通过' : '审核拒绝'}
            </h3>
            <div className="mb-4">
              <p className="text-sm text-slate-600 mb-2">题目预览：</p>
              <div className="bg-slate-50 p-3 rounded-lg text-sm line-clamp-3">
                {selectedQuestion.content}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                审核意见（可选）
              </label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border rounded-md"
                placeholder={reviewAction === 'APPROVED' ? '可选：填写通过说明' : '请填写拒绝原因'}
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={submitReview}
                className={reviewAction === 'APPROVED' ? 'bg-green-600 hover:bg-green-700' : ''}
                variant={reviewAction === 'REJECTED' ? 'outline' : 'default'}
              >
                确认{reviewAction === 'APPROVED' ? '通过' : '拒绝'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowReviewModal(false)}
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
