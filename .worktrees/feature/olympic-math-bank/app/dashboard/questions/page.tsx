'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, Search, ChevronDown, ChevronUp, ChevronRight, Copy, Edit3, FileText, Check, Star, Filter, X, TreeDeciduous } from 'lucide-react';
import { QuestionContent } from '@/components/QuestionContent';

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
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500"
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
                    ? 'bg-blue-100 text-blue-700 font-medium border border-blue-300'
                    : 'hover:bg-gray-50 text-gray-700'
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
  FILL_BLANK: 'bg-violet-50 text-violet-700 border-violet-200',
  CHOICE: 'bg-blue-50 text-blue-700 border-blue-200',
  SOLUTION: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CALCULATION: 'bg-amber-50 text-amber-700 border-amber-200',
};

const gradeLabels: Record<string, string> = {
  P1: '一年级',
  P2: '二年级',
  P3: '三年级',
  P4: '四年级',
  P5: '五年级',
  P6: '六年级',
};

const statusConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
  DRAFT: { label: '草稿', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' },
  PENDING: { label: '待审核', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  APPROVED: { label: '已通过', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  REJECTED: { label: '已拒绝', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
};

function DifficultyStars({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-3.5 h-3.5 ${star <= level ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
        />
      ))}
    </div>
  );
}

function QuestionCard({ question }: { question: Question }) {
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${status.bg} ${status.text} ${status.border}`}>
                {status.label}
              </span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${typeColor}`}>
                {typeLabels[question.type] || question.type}
              </span>
              <span className="text-sm text-gray-500">
                {gradeLabels[question.grade] || question.grade}
              </span>
              <DifficultyStars level={question.difficulty} />
            </div>

            <QuestionContent content={question.content} className="text-gray-900 text-base leading-relaxed" />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                expanded
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              <FileText className="w-4 h-4" />
              {expanded ? '收起' : '详情'}
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <Link href={`/dashboard/questions/${question.id}/edit`}>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 transition-all duration-150">
                <Edit3 className="w-4 h-4" />
                改编
              </button>
            </Link>
            <button
              onClick={handleCopyId}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                copied
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  复制ID
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-4">
            {question.knowledgeTags && question.knowledgeTags.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">知识标签:</span>
                <span className="text-sm text-blue-600 font-medium">
                  {getTagPathDash(question.knowledgeTags[0].knowledgeTag)}
                </span>
              </div>
            ) : (
              <span className="text-xs text-gray-400">未分类</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
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
        <div className="px-5 pb-5 pt-0 border-t border-gray-100 bg-gray-50/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                答案
              </h4>
              <QuestionContent content={question.answer || ''} className="text-gray-900 text-sm leading-relaxed" />
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                解析
              </h4>
              <QuestionContent content={question.solution || ''} className="text-gray-900 text-sm leading-relaxed" />
            </div>

            {(question.source || question.competition || question.year) && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 md:col-span-2">
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                  来源信息
                </h4>
                <div className="flex flex-wrap gap-3 text-sm">
                  {question.source && (
                    <span className="text-gray-600">
                      <span className="font-medium text-gray-500">来源:</span> {question.source}
                    </span>
                  )}
                  {question.competition && (
                    <span className="text-gray-600">
                      <span className="font-medium text-gray-500">竞赛:</span> {question.competition}
                    </span>
                  )}
                  {question.year && (
                    <span className="text-gray-600">
                      <span className="font-medium text-gray-500">年份:</span> {question.year}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg border border-gray-200 p-4 md:col-span-2">
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                题目ID
              </h4>
              <code className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">
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

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">题目管理</h2>
              <Link href="/dashboard/questions/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  新建题目
                </Button>
              </Link>
            </div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        </div>
        {showTagSidebar && (
          <div className="w-72 border-l border-gray-200 bg-white overflow-y-auto">
            <div className="p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
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
              <h2 className="text-2xl font-bold text-gray-900">题目管理</h2>
              {selectedTagId && (
                <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-full text-sm">
                  <span className="text-blue-600">标签筛选:</span>
                  <span className="text-blue-700 font-medium">
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
                  <button onClick={handleClearTagFilter} className="text-blue-500 hover:text-blue-700">
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
                className={showTagSidebar ? 'bg-blue-50' : ''}
              >
                <TreeDeciduous className="w-4 h-4 mr-2" />
                知识标签
              </Button>
              <Link href="/dashboard/questions/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  新建题目
                </Button>
              </Link>
            </div>
          </div>

          {/* 搜索和筛选区域 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex gap-4 items-center">
              <div className="flex-1 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="搜索题目内容..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <Button variant="outline" onClick={handleSearch}>
                  搜索
                </Button>
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  showFilters || (filter.status || filter.grade || filter.type)
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                <Filter className="w-4 h-4" />
                筛选
                {(filter.status || filter.grade || filter.type) && (
                  <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">
                    {(filter.status ? 1 : 0) + (filter.grade ? 1 : 0) + (filter.type ? 1 : 0)}
                  </span>
                )}
              </button>
            </div>

            {showFilters && (
              <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">状态</label>
                  <select
                    value={filter.status}
                    onChange={(e) => { setFilter({ ...filter, status: e.target.value }); }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">全部</option>
                    <option value="DRAFT">草稿</option>
                    <option value="PENDING">待审核</option>
                    <option value="APPROVED">已通过</option>
                    <option value="REJECTED">已拒绝</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">年级</label>
                  <select
                    value={filter.grade}
                    onChange={(e) => { setFilter({ ...filter, grade: e.target.value }); }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">题型</label>
                  <select
                    value={filter.type}
                    onChange={(e) => { setFilter({ ...filter, type: e.target.value }); }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="text-gray-500"
                  >
                    重置
                  </Button>
                  <Button size="sm" onClick={() => { setShowFilters(false); }}>
                    应用筛选
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* 题目列表 */}
          <div className="space-y-4">
            {questions.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                  <FileText className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">暂无题目</h3>
                <p className="text-gray-500 text-sm mb-4">
                  {selectedTagId ? '该标签下暂无题目' : '点击下方按钮添加第一道题目'}
                </p>
                <Link href="/dashboard/questions/new">
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    新建题目
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="text-sm text-gray-500">
                  共 {totalCount} 道题目
                  {selectedTagId && <span className="text-blue-600 ml-2">(已按标签筛选)</span>}
                </div>
                {questions.map((question) => (
                  <QuestionCard key={question.id} question={question} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 右侧知识标签树边栏 */}
      {showTagSidebar && (
        <div className="w-72 border-l border-gray-200 bg-white overflow-y-auto">
          <div className="p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <TreeDeciduous className="w-4 h-4" />
                知识标签树
              </h3>
              <button
                onClick={() => setShowTagSidebar(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* 标签搜索框 */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索标签..."
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {tagSearch && (
                <button
                  onClick={() => setTagSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {selectedTagId && (
              <button
                onClick={handleClearTagFilter}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
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
              <p className="text-sm text-gray-500 text-center py-4">{tagSearch ? '未找到匹配的标签' : '暂无标签数据'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
