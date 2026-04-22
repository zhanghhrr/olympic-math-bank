'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, BookOpen, Loader2, Layers } from 'lucide-react';

interface KnowledgeTag {
  id: string;
  level: number;
  name: string;
  code: string;
  module: string;
  topic?: string;
  subtopic?: string;
  knowledge?: string;
  skill?: string;
  parentId?: string;
  order: number;
  _count: {
    questions: number;
  };
  children?: { id: string }[];
}

const levelLabels: Record<number, string> = {
  1: '一级模块',
  2: '二级专题',
  3: '三级子专题',
  4: '四级知识点',
  5: '五级技能',
};

const levelColors: Record<number, string> = {
  1: 'bg-red-100 text-red-700 border-red-200',
  2: 'bg-orange-100 text-orange-700 border-orange-200',
  3: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  4: 'bg-green-100 text-green-700 border-green-200',
  5: 'bg-blue-100 text-blue-700 border-blue-200',
};

export default function KnowledgeTagsPage() {
  const [tags, setTags] = useState<KnowledgeTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [modules, setModules] = useState<string[]>([]);

  useEffect(() => {
    fetchModules();
  }, []);

  useEffect(() => {
    if (selectedModule) {
      fetchTags();
    }
  }, [selectedModule]);

  const fetchModules = async () => {
    try {
      const res = await fetch('/api/knowledge-tags', { method: 'POST' });
      const data = await res.json();
      const moduleList = data.modules?.map((m: KnowledgeTag) => m.name) || [];
      setModules(moduleList);
      if (moduleList.length > 0) {
        setSelectedModule(moduleList[0]);
      }
    } catch (error) {
      console.error('Failed to fetch modules:', error);
    }
  };

  const fetchTags = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/knowledge-tags?module=${encodeURIComponent(selectedModule)}`);
      const data = await res.json();
      setTags(data.tags || []);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  // 构建树形结构
  const buildTree = (tags: KnowledgeTag[]): KnowledgeTag[] => {
    const tagMap = new Map<string, KnowledgeTag>();
    const roots: KnowledgeTag[] = [];

    // 先创建映射
    tags.forEach(tag => {
      tagMap.set(tag.id, { ...tag, children: [] });
    });

    // 构建父子关系
    tags.forEach(tag => {
      const node = tagMap.get(tag.id)!;
      if (tag.parentId && tagMap.has(tag.parentId)) {
        const parent = tagMap.get(tag.parentId)!;
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  // 渲染树节点
  const renderNode = (node: KnowledgeTag, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isLastLevel = node.level === 5;

    return (
      <div key={node.id} className="select-none">
        <div
          className={`flex items-center gap-2 py-2 px-3 hover:bg-muted/50 rounded-xl cursor-pointer transition-colors ${
            depth > 0 ? 'ml-6 border-l-2 border-border pl-4' : ''
          }`}
          style={{ marginLeft: `${depth * 24}px` }}
          onClick={() => hasChildren && toggleExpand(node.id)}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )
          ) : (
            <span className="w-4" />
          )}

          <span className={`text-xs px-2 py-0.5 rounded-full border ${levelColors[node.level]}`}>
            {levelLabels[node.level]}
          </span>

          <span className="font-medium text-foreground">{node.name}</span>

          {node._count?.questions > 0 && (
            <span className="text-xs text-muted-foreground">({node._count.questions}题)</span>
          )}

          {isLastLevel && (
            <BookOpen className="w-3 h-3 text-muted-foreground ml-auto" />
          )}
        </div>

        {isExpanded && hasChildren && (
          <div className="mt-1">
            {node.children!.map(child => renderNode(child as KnowledgeTag, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const treeData = buildTree(tags);

  // 统计各级别数量
  const stats = tags.reduce((acc, tag) => {
    acc[tag.level] = (acc[tag.level] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground tracking-tight">五级知识标签管理</h2>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <Layers className="w-4 h-4" />
            <span>共 {tags.length} 个标签 |</span>
            {Object.entries(stats).map(([level, count]) => (
              <span key={level} className="ml-2">
                {levelLabels[parseInt(level)]}: {count}个
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 模块选择 */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {modules.map((module) => (
          <button
            key={module}
            onClick={() => setSelectedModule(module)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedModule === module
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {module}
          </button>
        ))}
      </div>

      {/* 标签树 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">加载中...</span>
        </div>
      ) : (
        <div className="card-elevated overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/50">
            <h3 className="font-medium text-foreground">
              {selectedModule} - 知识标签树
            </h3>
          </div>
          <div className="p-4">
            {treeData.length > 0 ? (
              treeData.map(node => renderNode(node))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                暂无标签数据
              </div>
            )}
          </div>
        </div>
      )}

      {/* 图例 */}
      <div className="mt-6 flex gap-4 flex-wrap">
        {Object.entries(levelLabels).map(([level, label]) => (
          <div key={level} className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${levelColors[parseInt(level)]}`}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
