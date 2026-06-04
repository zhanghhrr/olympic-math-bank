'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Edit2, Save, X } from 'lucide-react';
import { QuestionContent } from '@/components/QuestionContent';

interface QuestionPreview {
  id: string;
  content: string;
  answer: string;
  solution: string | null;
  type: string;
  difficulty: number;
  status: string;
  matchedTags: Array<{
    id: string;
    name: string;
    path: string;
    score?: number;
    matchSource?: string;
  }>;
  pages?: number[];
}

interface QuestionCardProps {
  question: QuestionPreview;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onUpdate: (id: string, data: Partial<QuestionPreview>) => void;
  onRemoveTag: (questionId: string, tagId: string) => void;
}

function getConfidenceLevel(score: number) {
  if (score >= 5) {
    return { label: '高', dot: 'bg-green-500', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
  }
  if (score >= 3) {
    return { label: '中', dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
  }
  return { label: '低', dot: 'bg-red-400', bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' };
}

function getMatchSourceLabel(source?: string) {
  const labels: Record<string, string> = {
    section_title: '章节标题',
    annotation: '标注文本',
    keyword: '关键词匹配',
    llm: 'AI推断',
  };
  return labels[source || ''] || '未知';
}

export function QuestionCard({
  question,
  isSelected,
  onSelect,
  onUpdate,
  onRemoveTag,
}: QuestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    content: question.content,
    answer: question.answer,
    solution: question.solution || '',
  });

  const handleSave = () => {
    onUpdate(question.id, editData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData({
      content: question.content,
      answer: question.answer,
      solution: question.solution || '',
    });
    setIsEditing(false);
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      FILL_BLANK: '填空题',
      CHOICE: '选择题',
      SOLUTION: '解答题',
      CALCULATION: '计算题',
      SINGLE_CHOICE: '单选题',
      MULTI_CHOICE: '多选题',
      PROOF: '证明题',
    };
    return labels[type] || type;
  };

  return (
    <div
      className={`border border-border rounded-xl p-4 transition-all ${
        isSelected ? 'border-primary bg-primary/5' : 'bg-surface hover:shadow-md'
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(question.id, e.target.checked)}
          className="mt-1 w-4 h-4 text-primary rounded cursor-pointer"
        />

        {/* Content Preview */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="badge badge-draft">
              {getTypeLabel(question.type)}
            </span>
            <span className="badge bg-warning/10 text-warning">
              难度 {question.difficulty}
            </span>
            <span className="badge badge-pending">
              {question.status === 'DRAFT' ? '草稿' : question.status}
            </span>
            {question.pages && question.pages.length > 0 && (
              <span className="badge bg-muted text-muted-foreground" title={`题目位于第 ${question.pages.join(', ')} 页`}>
                第{question.pages.join(',')}页
              </span>
            )}
          </div>

          {/* Question Content Preview */}
          <p className="text-foreground text-sm line-clamp-2 mb-2">
            {question.content.length > 100
              ? question.content.substring(0, 100) + '...'
              : question.content}
          </p>

          {/* Answer Preview */}
          <p className="text-muted-foreground text-xs mb-2">
            <span className="font-medium">答案：</span>
            {question.answer.length > 50
              ? question.answer.substring(0, 50) + '...'
              : question.answer}
          </p>

          {/* Tags */}
          {question.matchedTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {question.matchedTags.map((tag) => {
                const confidence = getConfidenceLevel(tag.score ?? 0);
                return (
                  <span
                    key={tag.id}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${confidence.bg} ${confidence.text} ${confidence.border}`}
                    title={`${tag.path} | 置信度: ${confidence.label} (${tag.score ?? 0}分) | 来源: ${getMatchSourceLabel(tag.matchSource)}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${confidence.dot}`} />
                    {tag.name}
                    {isEditing && (
                      <button
                        onClick={() => onRemoveTag(question.id, tag.id)}
                        className="ml-1 hover:text-error"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          {question.matchedTags.length === 0 && (
            <p className="text-muted-foreground text-xs italic mb-2">未打标签</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 px-2 hover:bg-muted"
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
          {isExpanded && !isEditing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="h-8 px-2 hover:bg-muted"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-border">
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">题干</label>
                <textarea
                  value={editData.content}
                  onChange={(e) => setEditData({ ...editData, content: e.target.value })}
                  rows={4}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">答案</label>
                <textarea
                  value={editData.answer}
                  onChange={(e) => setEditData({ ...editData, answer: e.target.value })}
                  rows={2}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">解析</label>
                <textarea
                  value={editData.solution}
                  onChange={(e) => setEditData({ ...editData, solution: e.target.value })}
                  rows={3}
                  className="input-field"
                  placeholder="可选"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={handleCancel} className="border-border hover:bg-muted rounded-xl">
                  <X className="w-4 h-4 mr-1" />
                  取消
                </Button>
                <Button size="sm" onClick={handleSave} className="bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl">
                  <Save className="w-4 h-4 mr-1" />
                  保存
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">题干</label>
                <QuestionContent content={question.content} className="text-foreground text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">答案</label>
                <QuestionContent content={question.answer} className="text-foreground text-sm" />
              </div>
              {question.solution && (
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">解析</label>
                  <QuestionContent content={question.solution} className="text-muted-foreground text-sm" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
