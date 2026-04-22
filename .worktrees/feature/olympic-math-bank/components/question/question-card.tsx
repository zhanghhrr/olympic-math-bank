'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Edit2, Save, X, Tag } from 'lucide-react';
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
  }>;
}

interface QuestionCardProps {
  question: QuestionPreview;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onUpdate: (id: string, data: Partial<QuestionPreview>) => void;
  onRemoveTag: (questionId: string, tagId: string) => void;
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
              {question.matchedTags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs"
                  title={tag.path}
                >
                  <Tag className="w-3 h-3" />
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
              ))}
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
