'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { VisualLatexEditor } from '@/components/VisualLatexEditor';
import { Tags, X, Star } from 'lucide-react';

interface QuestionFormProps {
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
  initialData?: Partial<{
    content: string;
    answer: string;
    solution: string;
    type: string;
    grade: string;
    difficulty: number;
    source: string;
    year: number;
    competition: string;
    tagIds: string[];
    knowledgeTagIds: string[];
  }>;
}

interface Tag {
  id: string;
  name: string;
  type: string;
}

interface KnowledgeTag {
  id: string;
  name: string;
  level: number;
  code: string;
  module: string;
  topic: string | null;
  subtopic: string | null;
  knowledge: string | null;
  skill: string | null;
  children?: KnowledgeTag[];
}

export function QuestionForm({ onSubmit, isSubmitting, initialData }: QuestionFormProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [knowledgeTree, setKnowledgeTree] = useState<KnowledgeTag[]>([]);
  const [selectedKnowledgeTags, setSelectedKnowledgeTags] = useState<string[]>([]);

  // 级联选择状态
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedSubtopic, setSelectedSubtopic] = useState<string>('');
  const [selectedKnowledge, setSelectedKnowledge] = useState<string>('');
  const [selectedSkill, setSelectedSkill] = useState<string>('');

  const [formData, setFormData] = useState({
    content: initialData?.content || '',
    answer: initialData?.answer || '',
    solution: initialData?.solution || '',
    type: initialData?.type || 'SINGLE_CHOICE',
    grade: initialData?.grade || 'P3',
    difficulty: initialData?.difficulty || 3,
    source: initialData?.source || '',
    year: initialData?.year || new Date().getFullYear(),
    competition: initialData?.competition || '',
    tagIds: initialData?.tagIds || [],
    knowledgeTagIds: initialData?.knowledgeTagIds || [],
  });

  useEffect(() => {
    fetch('/api/tags')
      .then(res => res.json())
      .then(data => setTags(data.tags || []));

    // 加载知识标签树
    fetch('/api/knowledge-tags/tree')
      .then(res => res.json())
      .then(data => setKnowledgeTree(data.tree || []));
  }, []);

  // 初始化已选知识标签（编辑时从 initialData 加载）
  useEffect(() => {
    if (initialData?.knowledgeTagIds && initialData.knowledgeTagIds.length > 0) {
      setSelectedKnowledgeTags(initialData.knowledgeTagIds);
      
      // 根据已选标签自动展开级联选择器
      // 找到最深层的标签ID
      const deepestTagId = initialData.knowledgeTagIds[initialData.knowledgeTagIds.length - 1];
      
      // 在树中查找该标签的完整路径
      const findTagPath = (nodes: KnowledgeTag[], targetId: string, path: string[] = []): string[] | null => {
        for (const node of nodes) {
          const newPath = [...path, node.id];
          if (node.id === targetId) {
            return newPath;
          }
          if (node.children) {
            const result = findTagPath(node.children, targetId, newPath);
            if (result) return result;
          }
        }
        return null;
      };
      
      const tagPath = findTagPath(knowledgeTree, deepestTagId);
      if (tagPath && tagPath.length >= 1) {
        setSelectedModule(tagPath[0] || '');
        if (tagPath.length >= 2) setSelectedTopic(tagPath[1]);
        if (tagPath.length >= 3) setSelectedSubtopic(tagPath[2]);
        if (tagPath.length >= 4) setSelectedKnowledge(tagPath[3]);
        if (tagPath.length >= 5) setSelectedSkill(tagPath[4]);
      }
    }
  }, [initialData?.knowledgeTagIds, knowledgeTree]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      knowledgeTagIds: selectedKnowledgeTags,
    });
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
      <div className="grid grid-cols-2 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">题型</label>
          <select
            value={formData.type}
            onChange={e => setFormData({ ...formData, type: e.target.value })}
            className="select-field select-field-full"
          >
            {typeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">年级</label>
          <select
            value={formData.grade}
            onChange={e => setFormData({ ...formData, grade: e.target.value })}
            className="select-field select-field-full"
          >
            {gradeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-3">难度</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setFormData({ ...formData, difficulty: n })}
              className="p-1 transition-transform hover:scale-110 focus:outline-none"
            >
              <Star
                size={28}
                className={`transition-colors ${
                  n <= formData.difficulty
                    ? 'text-primary fill-primary'
                    : 'text-muted'
                }`}
              />
            </button>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">{formData.difficulty}星</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border p-5">
        <label className="block text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
          题目内容
        </label>
        <VisualLatexEditor
          value={formData.content}
          onChange={(value) => setFormData({ ...formData, content: value })}
          placeholder="请输入题目内容，支持 LaTeX 公式"
          rows={6}
          className="bg-white"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border p-5">
        <label className="block text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
          答案
        </label>
        <VisualLatexEditor
          value={formData.answer}
          onChange={(value) => setFormData({ ...formData, answer: value })}
          placeholder="请输入答案"
          rows={3}
          className="bg-white"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border p-5">
        <label className="block text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
          解析
        </label>
        <VisualLatexEditor
          value={formData.solution}
          onChange={(value) => setFormData({ ...formData, solution: value })}
          placeholder="请输入解题思路和步骤"
          rows={6}
          className="bg-white"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">来源</label>
          <input
            type="text"
            value={formData.source}
            onChange={e => setFormData({ ...formData, source: e.target.value })}
            className="input-field"
            placeholder="如：迎春杯、华罗庚金杯等"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">年份</label>
          <input
            type="number"
            value={formData.year}
            onChange={e => setFormData({ ...formData, year: parseInt(e.target.value) })}
            className="input-field"
          />
        </div>
      </div>

        {/* 五级知识标签选择 */}
        <div className="border border-border rounded-xl p-5 bg-white shadow-sm">
          <label className="block text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Tags className="w-4 h-4" />
            知识标签（五级）
          </label>

          {/* 一级：模块 */}
          <div className="mb-3">
            <label className="block text-xs text-muted-foreground mb-1">一级模块</label>
            <select
              value={selectedModule}
              onChange={e => {
                const val = e.target.value;
                setSelectedModule(val);
                setSelectedTopic('');
                setSelectedSubtopic('');
                setSelectedKnowledge('');
                setSelectedSkill('');
                // 自动添加到已选标签
                if (val && !selectedKnowledgeTags.includes(val)) {
                  setSelectedKnowledgeTags([...selectedKnowledgeTags, val]);
                }
              }}
              className="select-field select-field-full"
            >
              <option value="">选择模块</option>
              {knowledgeTree.map(module => (
                <option key={module.id} value={module.id}>{module.name}</option>
              ))}
            </select>
          </div>

          {/* 二级：专题 */}
          {selectedModule && (
            <div className="mb-3 ml-4">
              <label className="block text-xs text-muted-foreground mb-1">二级专题</label>
              <select
                value={selectedTopic}
                onChange={e => {
                  const val = e.target.value;
                  setSelectedTopic(val);
                  setSelectedSubtopic('');
                  setSelectedKnowledge('');
                  setSelectedSkill('');
                  // 自动添加到已选标签
                  if (val && !selectedKnowledgeTags.includes(val)) {
                    setSelectedKnowledgeTags([...selectedKnowledgeTags, val]);
                  }
                }}
                className="select-field select-field-full"
              >
                <option value="">选择专题</option>
                {knowledgeTree.find(m => m.id === selectedModule)?.children?.map(topic => (
                  <option key={topic.id} value={topic.id}>{topic.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 三级：子专题 */}
          {selectedTopic && (
            <div className="mb-3 ml-8">
              <label className="block text-xs text-muted-foreground mb-1">三级子专题</label>
              <select
                value={selectedSubtopic}
                onChange={e => {
                  const val = e.target.value;
                  setSelectedSubtopic(val);
                  setSelectedKnowledge('');
                  setSelectedSkill('');
                  // 自动添加到已选标签
                  if (val && !selectedKnowledgeTags.includes(val)) {
                    setSelectedKnowledgeTags([...selectedKnowledgeTags, val]);
                  }
                }}
                className="select-field select-field-full"
              >
                <option value="">选择子专题</option>
                {knowledgeTree
                  .find(m => m.id === selectedModule)?.children
                  ?.find(t => t.id === selectedTopic)?.children
                  ?.map(subtopic => (
                    <option key={subtopic.id} value={subtopic.id}>{subtopic.name}</option>
                  ))}
              </select>
            </div>
          )}

          {/* 四级：知识点 */}
          {selectedSubtopic && (
            <div className="mb-3 ml-12">
              <label className="block text-xs text-muted-foreground mb-1">四级知识点</label>
              <select
                value={selectedKnowledge}
                onChange={e => {
                  const val = e.target.value;
                  setSelectedKnowledge(val);
                  setSelectedSkill('');
                  // 自动添加到已选标签
                  if (val && !selectedKnowledgeTags.includes(val)) {
                    setSelectedKnowledgeTags([...selectedKnowledgeTags, val]);
                  }
                }}
                className="select-field select-field-full"
              >
                <option value="">选择知识点</option>
                {knowledgeTree
                  .find(m => m.id === selectedModule)?.children
                  ?.find(t => t.id === selectedTopic)?.children
                  ?.find(s => s.id === selectedSubtopic)?.children
                  ?.map(knowledge => (
                    <option key={knowledge.id} value={knowledge.id}>{knowledge.name}</option>
                  ))}
              </select>
            </div>
          )}

          {/* 五级：技能 */}
          {selectedKnowledge && (
            <div className="mb-3 ml-16">
              <label className="block text-xs text-muted-foreground mb-1">五级技能</label>
              <select
                value={selectedSkill}
                onChange={e => {
                  const val = e.target.value;
                  setSelectedSkill(val);
                  // 自动添加到已选标签
                  if (val && !selectedKnowledgeTags.includes(val)) {
                    setSelectedKnowledgeTags([...selectedKnowledgeTags, val]);
                  }
                }}
                className="select-field select-field-full"
              >
                <option value="">选择技能（可选）</option>
                {knowledgeTree
                  .find(m => m.id === selectedModule)?.children
                  ?.find(t => t.id === selectedTopic)?.children
                  ?.find(s => s.id === selectedSubtopic)?.children
                  ?.find(k => k.id === selectedKnowledge)?.children
                  ?.map(skill => (
                    <option key={skill.id} value={skill.id}>{skill.name}</option>
                  ))}
              </select>
            </div>
          )}

          {/* 重置按钮 */}
          <div className="flex gap-2 mt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedModule('');
                setSelectedTopic('');
                setSelectedSubtopic('');
                setSelectedKnowledge('');
                setSelectedSkill('');
                setSelectedKnowledgeTags([]);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              清空选择
            </Button>
          </div>

          {/* 已选标签 */}
          {selectedKnowledgeTags.length > 0 && (
            <div className="mt-3">
              <label className="block text-xs text-muted-foreground mb-1">已选知识标签：</label>
              <div className="flex flex-wrap gap-2">
                {selectedKnowledgeTags.map(tagId => {
                  const findTag = (tree: KnowledgeTag[], id: string): KnowledgeTag | undefined => {
                    for (const node of tree) {
                      if (node.id === id) return node;
                      if (node.children) {
                        const found = findTag(node.children, id);
                        if (found) return found;
                      }
                    }
                    return undefined;
                  };
                  const tag = findTag(knowledgeTree, tagId);
                  return tag ? (
                    <span key={tagId} className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary text-xs rounded-full">
                      {tag.name}
                      <button
                        type="button"
                        onClick={() => setSelectedKnowledgeTags(selectedKnowledgeTags.filter(id => id !== tagId))}
                        className="hover:text-primary/80"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">普通标签</label>
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <label key={tag.id} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-xl cursor-pointer hover:bg-muted transition-colors">
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
              <span className="text-sm text-foreground">{tag.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-4 pt-4 border-t border-border">
        <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary-hover text-primary-foreground shadow-md hover:shadow-lg transition-all rounded-xl">
          {isSubmitting ? '保存中...' : '保存题目'}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.history.back()} className="border-border hover:bg-muted rounded-xl">
          取消
        </Button>
      </div>
    </form>
  );
}
