'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, Search, Filter } from 'lucide-react';
import { KnowledgeTagBadge } from '@/components/knowledge-tag-display';

interface KnowledgeTag {
  id: string;
  name: string;
  level: number;
  parent?: any;
}

interface Question {
  id: string;
  content: string;
  type: string;
  grade: string;
  difficulty: number;
  status: string;
  createdBy: { name: string };
  tags: { tag: { name: string } }[];
  knowledgeTags?: { knowledgeTag: KnowledgeTag }[];
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

const statusLabels: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'bg-gray-100 text-gray-700' },
  PENDING: { label: '待审核', color: 'bg-yellow-100 text-yellow-700' },
  APPROVED: { label: '已通过', color: 'bg-green-100 text-green-700' },
  REJECTED: { label: '已拒绝', color: 'bg-red-100 text-red-700' },
};

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ status: '', grade: '', type: '' });

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      if (filter.grade) params.append('grade', filter.grade);
      if (filter.type) params.append('type', filter.type);
      if (search) params.append('search', search);

      const res = await fetch(`/api/questions?${params}`);
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch (error) {
      console.error('Failed to fetch questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchQuestions();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">题目管理</h2>
          <Link href="/dashboard/questions/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              新建题目
            </Button>
          </Link>
        </div>
        <div className="text-center py-12 text-slate-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">题目管理</h2>
        <Link href="/dashboard/questions/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            新建题目
          </Button>
        </Link>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex gap-4 items-center">
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            placeholder="搜索题目内容..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1 px-4 py-2 border rounded-md"
          />
          <Button variant="outline" onClick={handleSearch}>
            <Search className="w-4 h-4 mr-2" />
            搜索
          </Button>
        </div>
        <select
          value={filter.status}
          onChange={(e) => { setFilter({ ...filter, status: e.target.value }); fetchQuestions(); }}
          className="px-3 py-2 border rounded-md"
        >
          <option value="">所有状态</option>
          <option value="DRAFT">草稿</option>
          <option value="PENDING">待审核</option>
          <option value="APPROVED">已通过</option>
          <option value="REJECTED">已拒绝</option>
        </select>
        <select
          value={filter.grade}
          onChange={(e) => { setFilter({ ...filter, grade: e.target.value }); fetchQuestions(); }}
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
      </div>

      {/* 题目列表 */}
      <div className="bg-white rounded-lg border">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">题目内容</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">知识标签</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">题型</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">年级</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">难度</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">状态</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">创建人</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">创建时间</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {questions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  暂无题目，点击"新建题目"添加
                </td>
              </tr>
            ) : (
              questions.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="max-w-md truncate" title={q.content}>
                      {q.content}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {q.knowledgeTags && q.knowledgeTags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {q.knowledgeTags.slice(0, 2).map(({ knowledgeTag }) => (
                          <KnowledgeTagBadge key={knowledgeTag.id} tag={knowledgeTag} />
                        ))}
                        {q.knowledgeTags.length > 2 && (
                          <span className="text-xs text-gray-400">+{q.knowledgeTags.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">未分类</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">{typeLabels[q.type] || q.type}</td>
                  <td className="px-4 py-3 text-sm">{gradeLabels[q.grade] || q.grade}</td>
                  <td className="px-4 py-3 text-sm">{'★'.repeat(q.difficulty)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${statusLabels[q.status]?.color || 'bg-gray-100'}`}>
                      {statusLabels[q.status]?.label || q.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{q.createdBy.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {new Date(q.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
