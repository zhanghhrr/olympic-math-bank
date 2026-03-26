'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface QuestionFormProps {
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}

interface Tag {
  id: string;
  name: string;
  type: string;
}

export function QuestionForm({ onSubmit, isSubmitting }: QuestionFormProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [formData, setFormData] = useState({
    content: '',
    answer: '',
    solution: '',
    type: 'SINGLE_CHOICE',
    grade: 'P3',
    difficulty: 3,
    source: '',
    year: new Date().getFullYear(),
    competition: '',
    tagIds: [] as string[],
  });

  useEffect(() => {
    fetch('/api/tags')
      .then(res => res.json())
      .then(data => setTags(data.tags || []));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const gradeOptions = [
    { value: 'P1', label: '一年级' },
    { value: 'P2', label: '二年级' },
    { value: 'P3', label: '三年级' },
    { value: 'P4', label: '四年级' },
    { value: 'P5', label: '五年级' },
    { value: 'P6', label: '六年级' },
  ];

  const typeOptions = [
    { value: 'SINGLE_CHOICE', label: '单选题' },
    { value: 'MULTI_CHOICE', label: '多选题' },
    { value: 'FILL_BLANK', label: '填空题' },
    { value: 'SOLUTION', label: '解答题' },
    { value: 'PROOF', label: '证明题' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">题型</label>
          <select
            value={formData.type}
            onChange={e => setFormData({ ...formData, type: e.target.value })}
            className="w-full px-3 py-2 border rounded-md"
          >
            {typeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">年级</label>
          <select
            value={formData.grade}
            onChange={e => setFormData({ ...formData, grade: e.target.value })}
            className="w-full px-3 py-2 border rounded-md"
          >
            {gradeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">难度</label>
        <select
          value={formData.difficulty}
          onChange={e => setFormData({ ...formData, difficulty: parseInt(e.target.value) })}
          className="w-full px-3 py-2 border rounded-md"
        >
          {[1, 2, 3, 4, 5].map(n => (
            <option key={n} value={n}>{n}星</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">题目内容</label>
        <textarea
          value={formData.content}
          onChange={e => setFormData({ ...formData, content: e.target.value })}
          rows={6}
          className="w-full px-3 py-2 border rounded-md"
          placeholder="请输入题目内容，支持 LaTeX 公式"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">答案</label>
        <textarea
          value={formData.answer}
          onChange={e => setFormData({ ...formData, answer: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border rounded-md"
          placeholder="请输入答案"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">详细解答</label>
        <textarea
          value={formData.solution}
          onChange={e => setFormData({ ...formData, solution: e.target.value })}
          rows={6}
          className="w-full px-3 py-2 border rounded-md"
          placeholder="请输入详细解答步骤"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">来源</label>
          <input
            type="text"
            value={formData.source}
            onChange={e => setFormData({ ...formData, source: e.target.value })}
            className="w-full px-3 py-2 border rounded-md"
            placeholder="如：迎春杯、华罗庚金杯等"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">年份</label>
          <input
            type="number"
            value={formData.year}
            onChange={e => setFormData({ ...formData, year: parseInt(e.target.value) })}
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">标签</label>
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <label key={tag.id} className="flex items-center gap-1 px-3 py-1 border rounded-full cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={formData.tagIds.includes(tag.id)}
                onChange={e => {
                  if (e.target.checked) {
                    setFormData({ ...formData, tagIds: [...formData.tagIds, tag.id] });
                  } else {
                    setFormData({ ...formData, tagIds: formData.tagIds.filter(id => id !== tag.id) });
                  }
                }}
                className="rounded"
              />
              <span className="text-sm">{tag.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '保存中...' : '保存题目'}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.history.back()}>
          取消
        </Button>
      </div>
    </form>
  );
}
