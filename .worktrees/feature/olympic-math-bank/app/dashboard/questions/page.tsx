'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, Search, ChevronDown, ChevronUp, ChevronRight, Copy, Edit3, FileText, Check, Star, Filter, X, TreeDeciduous, ShoppingCart, Settings, Download, Tag } from 'lucide-react';
import { QuestionContent } from '@/components/QuestionContent';
import { BatchTagDialog } from '@/components/knowledge-tag/batch-dialog';

interface KnowledgeTagTreeNode {
  id: string;
  name: string;
  level: number;
  children?: KnowledgeTagTreeNode[];
}

interface KnowledgeTag {
  id: string;
  name: string;
  level: number;
  module?: string;
  topic?: string;
  subtopic?: string;
  knowledge?: string;
  skill?: string;
  parent?: any;
}

function getTagPathDash(tag: KnowledgeTag): string {
  const parts: string[] = [];
  if (tag.parent?.parent?.parent?.parent) parts.push(tag.parent.parent.parent.parent.name);
  if (tag.parent?.parent?.parent) parts.push(tag.parent.parent.parent.name);
  if (tag.parent?.parent) parts.push(tag.parent.parent.name);
  if (tag.parent) parts.push(tag.parent.name);
  parts.push(tag.name);
  return parts.join(' - ');
}

// 获取标签及其所有子标签的ID列表
function getTagAndDescendantIds(node: KnowledgeTagTreeNode): string[] {
  const ids = [node.id];
  if (node.children) {
    for (const child of node.children) {
      ids.push(...getTagAndDescendantIds(child));
    }
  }
  return ids;
}

// 高亮搜索文本中的匹配部分
function HighlightText({ text, search }: { text: string; search: string }) {
  if (!search) return <>{text}</>;
  const parts = text.split(new RegExp(`(${search})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === search.toLowerCase() ? (
          <span key={i} className="bg-yellow-200 text-red-600 font-medium">{part}</span>
        ) : (
          part
        )
      )}
    </>
  );
}

// 知识标签树组件
function KnowledgeTagTree({
  nodes,
  selectedId,
  onSelect,
  expandedNodes,
  onToggleExpand,
  searchText = '',
  level = 0
}: {
  nodes: KnowledgeTagTreeNode[];
  selectedId: string | null;
  onSelect: (id: string, ids: string[]) => void;
  expandedNodes: Set<string>;
  onToggleExpand: (id: string) => void;
  searchText?: string;
  level?: number;
}) {
  if (!nodes || nodes.length === 0) return null;

  return (
    <ul className={level > 0 ? 'pl-4' : ''}>
      {nodes.map((node) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedNodes.has(node.id) || (searchText && node.name.toLowerCase().includes(searchText.toLowerCase()));
        const isSelected = selectedId === node.id;

        return (
          <li key={node.id} className="py-0.5">
            <div className="flex items-center gap-1 group">
              {/* 展开/收起按钮 */}
              {hasChildren ? (
                <button
                  onClick={() => onToggleExpand(node.id)}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-5 h-5" />
              )}

              {/* 标签节点 */}
              <button
                onClick={() => onSelect(node.id, getTagAndDescendantIds(node))}
                className={`flex-1 flex items-center gap-2 px-2 py-1 rounded text-sm transition-all ${
                  isSelected
                    ? 'bg-primary/10 text-primary font-medium border border-primary/30'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                <span className="truncate">
                  <HighlightText text={node.name} search={searchText} />
                </span>
              </button>
            </div>

            {/* 子节点 - 搜索时自动展开 */}
            {hasChildren && isExpanded && (
              <KnowledgeTagTree
                nodes={node.children!}
                selectedId={selectedId}
                onSelect={onSelect}
                expandedNodes={expandedNodes}
                onToggleExpand={onToggleExpand}
                searchText={searchText}
                level={level + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface Question {
  id: string;
  content: string;
  answer: string;
  solution: string | null;
  type: string;
  grade: string;
  difficulty: number;
  status: string;
  source: string | null;
  year: number | null;
  competition: string | null;
  createdBy: { name: string };
  tags: { tag: { name: string; type: string } }[];
  knowledgeTags?: { knowledgeTag: KnowledgeTag }[];
  createdAt: string;
  updatedAt: string;
}

const typeLabels: Record<string, string> = {
  FILL_BLANK: '填空题',
  CHOICE: '选择题',
  SOLUTION: '解答题',
  CALCULATION: '计算题',
};

const typeColors: Record<string, string> = {
  FILL_BLANK: 'type-fill-blank',
  CHOICE: 'type-choice',
  SOLUTION: 'type-solution',
  CALCULATION: 'type-calculation',
};

const gradeLabels: Record<string, string> = {
  P1: '一年级',
  P2: '二年级',
  P3: '三年级',
  P4: '四年级',
  P5: '五年级',
  P6: '六年级',
};

const statusConfig: Record<string, { label: string; badgeClass: string }> = {
  DRAFT: { label: '草稿', badgeClass: 'badge-draft' },
  PENDING: { label: '待审核', badgeClass: 'badge-pending' },
  APPROVED: { label: '已通过', badgeClass: 'badge-approved' },
  REJECTED: { label: '已拒绝', badgeClass: 'badge-rejected' },
};

function DifficultyStars({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={14}
          className={`difficulty-star ${star <= level ? 'text-primary' : 'text-muted'}`}
          fill={star <= level ? 'hsl(24 65% 68%)' : 'none'}
        />
      ))}
    </div>
  );
}

function QuestionCard({ 
  question, 
  isSelected, 
  onSelectToggle 
}: { 
  question: Question;
  isSelected?: boolean;
  onSelectToggle?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const status = statusConfig[question.status] || statusConfig.DRAFT;
  const typeColor = typeColors[question.type] || typeColors.SOLUTION;

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(question.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className={`card-elevated overflow-hidden transition-all duration-200 ${isSelected ? 'ring-2 ring-primary border-transparent' : ''}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* 选择框 */}
          {onSelectToggle && (
            <div className="pt-1 shrink-0">
              <input 
                type="checkbox" 
                checked={isSelected} 
                onChange={() => onSelectToggle(question.id)}
                className="w-5 h-5 rounded border-muted-foreground/30 text-primary focus:ring-primary/20 cursor-pointer"
              />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <span className={`badge ${status.badgeClass}`}>
                {status.label}
              </span>
              <span className={`badge ${typeColor}`}>
                {typeLabels[question.type] || question.type}
              </span>
              <span className="text-sm text-muted-foreground">
                {gradeLabels[question.grade] || question.grade}
              </span>
              <DifficultyStars level={question.difficulty} />
            </div>

            <QuestionContent content={question.content} className="text-foreground text-base leading-relaxed" />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                expanded
                  ? 'bg-muted text-foreground hover:bg-muted/80'
                  : 'bg-primary/10 text-primary hover:bg-primary/20'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>{expanded ? '收起' : '详情'}</span>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <Link
              href={`/dashboard/questions/${question.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-gradient-to-br from-primary/80 to-primary text-primary-foreground hover:opacity-90 transition-all duration-150 shadow-sm"
              style={{ background: 'linear-gradient(135deg, hsl(24 65% 65%) 0%, hsl(24 55% 50%) 100%)' }}
            >
              <Edit3 className="w-4 h-4" />
              <span>改编</span>
            </Link>
            <button
              onClick={handleCopyId}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                copied
                  ? 'bg-success/10 text-success'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>复制ID</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <div className="flex items-center gap-4">
            {question.knowledgeTags && question.knowledgeTags.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">知识标签:</span>
                <span className="text-sm text-primary font-medium">
                  {getTagPathDash(question.knowledgeTags[0].knowledgeTag)}
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">未分类</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>创建人: {question.createdBy.name}</span>
            <span>{new Date(question.createdAt).toLocaleDateString('zh-CN')}</span>
          </div>
        </div>
      </div>

      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          expanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-5 pb-5 pt-0 border-t border-border bg-muted/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-surface rounded-lg border border-border p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                答案
              </h4>
              <QuestionContent content={question.answer || ''} className="text-foreground text-sm leading-relaxed" />
            </div>

            <div className="bg-surface rounded-lg border border-border p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                解析
              </h4>
              <QuestionContent content={question.solution || ''} className="text-foreground text-sm leading-relaxed" />
            </div>

            {(question.source || question.competition || question.year) && (
              <div className="bg-surface rounded-lg border border-border p-4 md:col-span-2">
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                  来源信息
                </h4>
                <div className="flex flex-wrap gap-3 text-sm">
                  {question.source && (
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">来源:</span> {question.source}
                    </span>
                  )}
                  {question.competition && (
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">竞赛:</span> {question.competition}
                    </span>
                  )}
                  {question.year && (
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">年份:</span> {question.year}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="bg-surface rounded-lg border border-border p-4 md:col-span-2">
              <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground"></span>
                题目ID
              </h4>
              <code className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                {question.id}
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuestionsPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ status: '', grade: '', type: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [tagTree, setTagTree] = useState<KnowledgeTagTreeNode[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [showTagSidebar, setShowTagSidebar] = useState(true);

  // 购物车选中的题目 IDs
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchGrade, setBatchGrade] = useState('');
  const [batchDifficulty, setBatchDifficulty] = useState('');
  const [showBatchTagDialog, setShowBatchTagDialog] = useState(false);
  const [batchUpdating, setBatchUpdating] = useState(false);

  useEffect(() => {
    fetchTagTree();
  }, []);

  // 监听所有筛选条件变化，自动刷新题目
  useEffect(() => {
    fetchQuestions();
  }, [filter.status, filter.grade, filter.type, search, selectedTagId, selectedTagIds]);

  const fetchTagTree = async () => {
    try {
      const res = await fetch('/api/knowledge-tags/tree');
      const data = await res.json();
      setTagTree(data.tree || []);
    } catch (error) {
      console.error('Failed to fetch tag tree:', error);
    }
  };

  const fetchQuestions = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      if (filter.grade) params.append('grade', filter.grade);
      if (filter.type) params.append('type', filter.type);
      if (search) params.append('search', search);
      if (selectedTagIds.length > 0) {
        params.append('knowledgeTagIds', selectedTagIds.join(','));
      }

      const res = await fetch(`/api/questions?${params}`);
      const data = await res.json();
      setQuestions(data.questions || []);
      setTotalCount(data.pagination?.total || 0);
    } catch (error) {
      console.error('Failed to fetch questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTagSelect = (id: string, ids: string[]) => {
    if (selectedTagId === id) {
      setSelectedTagId(null);
      setSelectedTagIds([]);
    } else {
      setSelectedTagId(id);
      setSelectedTagIds(ids);
    }
    // useEffect会自动触发fetchQuestions
  };

  const handleToggleExpand = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSearch = () => {
    // useEffect会自动触发fetchQuestions
  };

  const handleClearTagFilter = () => {
    setSelectedTagId(null);
    setSelectedTagIds([]);
    // useEffect会自动触发fetchQuestions
  };

  // 过滤标签树，只显示包含搜索文本的标签及其父节点
  const filterTagTree = (nodes: KnowledgeTagTreeNode[], searchText: string): KnowledgeTagTreeNode[] => {
    if (!searchText) return nodes;
    
    const lowerSearch = searchText.toLowerCase();
    const result: KnowledgeTagTreeNode[] = [];
    
    for (const node of nodes) {
      // 递归过滤子节点
      const filteredChildren = node.children ? filterTagTree(node.children, searchText) : [];
      
      // 检查当前节点名称是否匹配
      const nameMatch = node.name.toLowerCase().includes(lowerSearch);
      
      // 如果当前节点匹配或其子节点有匹配的，则保留
      if (nameMatch || filteredChildren.length > 0) {
        result.push({
          ...node,
          // 如果是搜索状态，显示所有子节点（展开状态）
          children: filteredChildren.length > 0 ? filteredChildren : (nameMatch ? node.children : undefined)
        });
      }
    }
    
    return result;
  };

  // 收集所有匹配的节点ID及其祖先节点ID
  const collectExpandedIds = (nodes: KnowledgeTagTreeNode[], searchText: string, ancestorIds: Set<string> = new Set()): Set<string> => {
    if (!searchText) return ancestorIds;
    
    const lowerSearch = searchText.toLowerCase();
    
    for (const node of nodes) {
      const nameMatch = node.name.toLowerCase().includes(lowerSearch);
      const childMatches = node.children ? collectExpandedIds(node.children, searchText, ancestorIds) : ancestorIds;
      
      if (nameMatch || childMatches.size > 0) {
        ancestorIds.add(node.id);
      }
    }
    
    return ancestorIds;
  };

  const filteredTagTree = filterTagTree(tagTree, tagSearch);
  const autoExpandedIds = collectExpandedIds(tagTree, tagSearch);
  
  // 合并手动展开和自动展开的节点
  const mergedExpandedNodes = new Set([...expandedNodes, ...autoExpandedIds]);

  const hasActiveFilters = filter.status || filter.grade || filter.type || selectedTagId;

  // 切换题目选中状态
  const handleSelectQuestion = (id: string) => {
    setSelectedQuestionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 全选/取消全选当前页
  const handleSelectAllCurrentPage = () => {
    const currentPageIds = questions.map(q => q.id);
    const allSelected = currentPageIds.every(id => selectedQuestionIds.has(id));
    
    setSelectedQuestionIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        currentPageIds.forEach(id => next.delete(id));
      } else {
        currentPageIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleBatchUpdate = async () => {
    const ids = Array.from(selectedQuestionIds);
    const data: Record<string, unknown> = {};
    if (batchGrade) data.grade = batchGrade;
    if (batchDifficulty) data.difficulty = parseInt(batchDifficulty);
    if (Object.keys(data).length === 0) return;
    setBatchUpdating(true);
    try {
      const res = await fetch('/api/questions/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, data }),
      });
      const result = await res.json();
      if (result.success > 0) {
        setBatchGrade('');
        setBatchDifficulty('');
        setShowBatchEdit(false);
        fetchQuestions();
      }
    } catch (error) {
      console.error('批量更新失败:', error);
    } finally {
      setBatchUpdating(false);
    }
  };

  const handleBatchTagConfirm = async (tagIds: string[]) => {
    const ids = Array.from(selectedQuestionIds);
    setBatchUpdating(true);
    try {
      const res = await fetch('/api/questions/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, data: { knowledgeTagIds: tagIds } }),
      });
      const result = await res.json();
      if (result.success > 0) {
        setShowBatchTagDialog(false);
        fetchQuestions();
      }
    } catch (error) {
      console.error('批量打标签失败:', error);
    } finally {
      setBatchUpdating(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv' | 'md') => {
    const ids = Array.from(selectedQuestionIds);
    try {
      const res = await fetch(`/api/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionIds: ids }),
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename\*=UTF-8''(.+)/);
      a.download = match ? decodeURIComponent(match[1]) : `export.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(`导出 ${format.toUpperCase()} 失败:`, error);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground tracking-tight">题目管理</h2>
              <Link href="/dashboard/questions/new">
                <Button className="bg-primary hover:bg-primary-hover text-primary-foreground shadow-md hover:shadow-lg transition-all">
                  <Plus className="w-4 h-4 mr-2" />
                  新建题目
                </Button>
              </Link>
            </div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        </div>
        {showTagSidebar && (
          <div className="w-72 border-l border-border bg-surface overflow-y-auto">
            <div className="p-4 border-b border-border sticky top-0 bg-surface z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <TreeDeciduous className="w-4 h-4" />
                  知识标签树
                </h3>
              </div>
            </div>
            <div className="p-4">
              {tagTree.length > 0 && (
                <KnowledgeTagTree
                  nodes={tagTree}
                  selectedId={selectedTagId}
                  onSelect={handleTagSelect}
                  expandedNodes={expandedNodes}
                  onToggleExpand={handleToggleExpand}
                  searchText={tagSearch}
                />
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* 主内容区 */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="space-y-6">
          {/* 页面标题 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-foreground tracking-tight">题目管理</h2>
              {selectedTagId && (
                <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full text-sm">
                  <span className="text-primary">标签筛选:</span>
                  <span className="text-primary font-medium">
                    {tagTree && (() => {
                      const findName = (nodes: KnowledgeTagTreeNode[], id: string): string | null => {
                        for (const node of nodes) {
                          if (node.id === id) return node.name;
                          if (node.children) {
                            const found = findName(node.children, id);
                            if (found) return found;
                          }
                        }
                        return null;
                      };
                      return findName(tagTree, selectedTagId);
                    })()}
                  </span>
                  <button onClick={handleClearTagFilter} className="text-primary/60 hover:text-primary">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTagSidebar(!showTagSidebar)}
                className={showTagSidebar ? 'border-primary/30 bg-primary/5 text-primary' : ''}
              >
                <TreeDeciduous className="w-4 h-4 mr-2" />
                知识标签
              </Button>
              <Link href="/dashboard/questions/new">
                <Button className="bg-primary hover:bg-primary-hover text-primary-foreground shadow-md hover:shadow-lg transition-all">
                  <Plus className="w-4 h-4 mr-2" />
                  新建题目
                </Button>
              </Link>
            </div>
          </div>

          {/* 搜索和筛选区域 */}
          <div className="card-elevated p-4">
            <div className="flex gap-4 items-center">
              <div className="flex-1 flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
                  <input
                    type="text"
                    placeholder="搜索题目内容..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="input-field pl-10 pr-4 w-full"
                    style={{ minWidth: 0, paddingLeft: '2.75rem' }}
                  />
                </div>
                <Button variant="outline" onClick={handleSearch} className="border-border hover:bg-muted">
                  搜索
                </Button>
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  showFilters || (filter.status || filter.grade || filter.type)
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'bg-muted text-muted-foreground border border-transparent hover:bg-muted/80'
                }`}
              >
                <Filter className="w-4 h-4" />
                筛选
                {(filter.status || filter.grade || filter.type) && (
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                    {(filter.status ? 1 : 0) + (filter.grade ? 1 : 0) + (filter.type ? 1 : 0)}
                  </span>
                )}
              </button>
            </div>

            {showFilters && (
              <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">状态</label>
                  <select
                    value={filter.status}
                    onChange={(e) => { setFilter({ ...filter, status: e.target.value }); }}
                    className="select-field select-field-full"
                  >
                    <option value="">全部</option>
                    <option value="DRAFT">草稿</option>
                    <option value="PENDING">待审核</option>
                    <option value="APPROVED">已通过</option>
                    <option value="REJECTED">已拒绝</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">年级</label>
                  <select
                    value={filter.grade}
                    onChange={(e) => { setFilter({ ...filter, grade: e.target.value }); }}
                    className="select-field select-field-full"
                  >
                    <option value="">全部</option>
                    <option value="P1">一年级</option>
                    <option value="P2">二年级</option>
                    <option value="P3">三年级</option>
                    <option value="P4">四年级</option>
                    <option value="P5">五年级</option>
                    <option value="P6">六年级</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">题型</label>
                  <select
                    value={filter.type}
                    onChange={(e) => { setFilter({ ...filter, type: e.target.value }); }}
                    className="select-field select-field-full"
                  >
                    <option value="">全部</option>
                    <option value="FILL_BLANK">填空题</option>
                    <option value="CHOICE">选择题</option>
                    <option value="SOLUTION">解答题</option>
                    <option value="CALCULATION">计算题</option>
                  </select>
                </div>
                <div className="col-span-3 flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setFilter({ status: '', grade: '', type: '' }); }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    重置
                  </Button>
                  <Button size="sm" onClick={() => { setShowFilters(false); }} className="bg-primary hover:bg-primary-hover text-primary-foreground">
                    应用筛选
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* 题目列表 */}
          <div className="space-y-4">
            {questions.length === 0 ? (
              <div className="card-elevated p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">暂无题目</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {selectedTagId ? '该标签下暂无题目' : '点击下方按钮添加第一道题目'}
                </p>
                <Link href="/dashboard/questions/new">
                  <Button className="bg-primary hover:bg-primary-hover text-primary-foreground shadow-md hover:shadow-lg transition-all">
                    <Plus className="w-4 h-4 mr-2" />
                    新建题目
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm text-muted-foreground bg-muted/30 p-2 rounded-lg border border-border">
                  <div className="flex items-center gap-3 pl-3">
                    <input 
                      type="checkbox" 
                      checked={questions.length > 0 && questions.every(q => selectedQuestionIds.has(q.id))}
                      onChange={handleSelectAllCurrentPage}
                      className="w-4 h-4 rounded border-muted-foreground/30 text-primary focus:ring-primary/20 cursor-pointer"
                    />
                    <span>全选当前页</span>
                  </div>
                  <div>
                    共 {totalCount} 道题目
                    {selectedTagId && <span className="text-primary ml-2">(已按标签筛选)</span>}
                  </div>
                </div>
                {questions.map((question) => (
                  <QuestionCard 
                    key={question.id} 
                    question={question} 
                    isSelected={selectedQuestionIds.has(question.id)}
                    onSelectToggle={handleSelectQuestion}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 右侧知识标签树边栏 */}
      {showTagSidebar && (
        <div className="w-72 border-l border-border bg-surface overflow-y-auto">
          <div className="p-4 border-b border-border sticky top-0 bg-surface z-10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <TreeDeciduous className="w-4 h-4" />
                知识标签树
              </h3>
              <button
                onClick={() => setShowTagSidebar(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* 标签搜索框 */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none z-10" />
              <input
                type="text"
                placeholder="搜索标签..."
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {tagSearch && (
                <button
                  onClick={() => setTagSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {selectedTagId && (
              <button
                onClick={handleClearTagFilter}
                className="mt-2 text-sm text-primary hover:text-primary/80 flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                清除标签筛选
              </button>
            )}
          </div>
          <div className="p-4">
            {filteredTagTree.length > 0 ? (
              <KnowledgeTagTree
                nodes={filteredTagTree}
                selectedId={selectedTagId}
                onSelect={handleTagSelect}
                expandedNodes={mergedExpandedNodes}
                onToggleExpand={handleToggleExpand}
                searchText={tagSearch}
              />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">{tagSearch ? '未找到匹配的标签' : '暂无标签数据'}</p>
            )}
          </div>
        </div>
      )}
      
      {/* 悬浮组卷购物车 */}
      {selectedQuestionIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface border border-border shadow-xl rounded-full px-6 py-3 flex items-center gap-6 z-50 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary relative">
              <ShoppingCart className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center font-bold">
                {selectedQuestionIds.size}
              </span>
            </div>
            <span className="text-sm font-medium text-foreground">已选题目</span>
          </div>
          <div className="h-6 w-px bg-border"></div>
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSelectedQuestionIds(new Set())}
              className="text-muted-foreground hover:text-foreground"
            >
              清空
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowBatchEdit(!showBatchEdit)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Settings className="w-4 h-4 mr-1" />
              批量编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowBatchTagDialog(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Tag className="w-4 h-4 mr-1" />
              批量打标签
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleExport('json')} className="text-muted-foreground hover:text-foreground">
              <Download className="w-4 h-4 mr-1" />
              JSON
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleExport('csv')} className="text-muted-foreground hover:text-foreground">
              <Download className="w-4 h-4 mr-1" />
              CSV
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleExport('md')} className="text-muted-foreground hover:text-foreground">
              <Download className="w-4 h-4 mr-1" />
              MD
            </Button>
            <Button 
              size="sm" 
              className="bg-primary hover:bg-primary-hover text-primary-foreground shadow-md px-6"
              onClick={() => {
                const ids = Array.from(selectedQuestionIds).join(',');
                router.push(`/dashboard/print?ids=${ids}`);
              }}
            >
              生成 PDF试卷
            </Button>
          </div>
        </div>
      )}

      {/* 批量编辑面板 */}
      {showBatchEdit && selectedQuestionIds.size > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-surface border border-border shadow-xl rounded-2xl px-6 py-4 z-50 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">年级:</label>
              <select
                value={batchGrade}
                onChange={(e) => setBatchGrade(e.target.value)}
                className="select-field text-sm h-9"
              >
                <option value="">不变</option>
                <option value="P1">一年级</option>
                <option value="P2">二年级</option>
                <option value="P3">三年级</option>
                <option value="P4">四年级</option>
                <option value="P5">五年级</option>
                <option value="P6">六年级</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">难度:</label>
              <select
                value={batchDifficulty}
                onChange={(e) => setBatchDifficulty(e.target.value)}
                className="select-field text-sm h-9"
              >
                <option value="">不变</option>
                <option value="1">★</option>
                <option value="2">★★</option>
                <option value="3">★★★</option>
                <option value="4">★★★★</option>
                <option value="5">★★★★★</option>
              </select>
            </div>
            <Button
              size="sm"
              onClick={handleBatchUpdate}
              disabled={batchUpdating || (!batchGrade && !batchDifficulty)}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              {batchUpdating ? '更新中...' : '应用'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowBatchEdit(false)}
              className="text-muted-foreground"
            >
              取消
            </Button>
          </div>
        </div>
      )}

      <BatchTagDialog
        isOpen={showBatchTagDialog}
        onClose={() => setShowBatchTagDialog(false)}
        onConfirm={handleBatchTagConfirm}
      />
    </div>
  );
}
