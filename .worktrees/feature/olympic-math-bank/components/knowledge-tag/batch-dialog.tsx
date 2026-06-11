'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, ChevronDown, ChevronRight, Tag } from 'lucide-react';

interface KnowledgeTagNode {
  id: string;
  name: string;
  level: number;
  children?: KnowledgeTagNode[];
}

interface BatchTagDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedTagId: string | null) => void;
}

export function BatchTagDialog({ isOpen, onClose, onConfirm }: BatchTagDialogProps) {
  const [tree, setTree] = useState<KnowledgeTagNode[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [namespace, setNamespace] = useState('default');

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch(`/api/knowledge-tags/tree?namespace=${encodeURIComponent(namespace)}`)
        .then((res) => res.json())
        .then((data) => {
          setTree(data.tree || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
      // 重置搜索和选中状态
      setSearchText('');
      setSelectedTagId(null);
    }
  }, [isOpen, namespace]);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedNodes(newExpanded);
  };

  const toggleSelect = (id: string) => {
    setSelectedTagId(selectedTagId === id ? null : id);
  };

  const handleConfirm = () => {
    if (selectedTagId) {
      onConfirm(selectedTagId);
    }
    setSelectedTagId(null);
    onClose();
  };

  const handleClose = () => {
    setSelectedTagId(null);
    setExpandedNodes(new Set());
    onClose();
  };

  // 递归渲染树节点
  const renderTreeNode = (node: KnowledgeTagNode, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedTagId === node.id;

    // 搜索过滤：如果节点名包含搜索词，或子节点有匹配，则显示
    if (searchText.trim()) {
      const matchesSelf = node.name.toLowerCase().includes(searchText.toLowerCase());
      const childrenMatch = node.children?.some(c => nodeMatchesSearch(c, searchText));
      if (!matchesSelf && !childrenMatch) return null;
    }

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded-xl cursor-pointer transition-colors ${
            isSelected ? 'bg-primary/10' : ''
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {/* Expand/Collapse Button */}
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(node.id)}
              className="p-0.5 hover:bg-muted rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}

          {/* Checkbox */}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(node.id)}
            className="w-4 h-4 text-primary rounded cursor-pointer"
          />

          {/* Node Name */}
          <span className={`text-sm ${isSelected ? 'text-primary font-medium' : 'text-foreground'}`}>
            {node.name}
          </span>

          {/* Level Badge */}
          <span className="text-xs text-muted-foreground">L{node.level}</span>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // 递归检查节点是否匹配搜索
  const nodeMatchesSearch = (node: KnowledgeTagNode, search: string): boolean => {
    if (node.name.toLowerCase().includes(search.toLowerCase())) return true;
    if (node.children) return node.children.some(c => nodeMatchesSearch(c, search));
    return false;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-lg text-foreground">批量打标签</h3>
            <p className="text-sm text-muted-foreground">
              {selectedTagId ? '已选择 1 个标签（替换现有标签）' : '未选择标签'}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-muted rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* 搜索框 */}
        <div className="px-4 pt-3 flex gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="搜索标签名..."
              value={searchText}
              onChange={(e) => {
              setSearchText(e.target.value);
              // 搜索时自动展开匹配节点的祖先
              if (e.target.value.trim()) {
                const newExpanded = new Set<string>();
                const collectAncestors = (nodes: KnowledgeTagNode[], targetId: string, path: string[]): boolean => {
                  for (const node of nodes) {
                    if (node.id === targetId) {
                      path.forEach(id => newExpanded.add(id));
                      return true;
                    }
                    if (node.children && collectAncestors(node.children, targetId, [...path, node.id])) {
                      return true;
                    }
                  }
                  return false;
                };
                const findMatchingIds = (nodes: KnowledgeTagNode[]): string[] => {
                  const ids: string[] = [];
                  for (const node of nodes) {
                    if (node.name.toLowerCase().includes(e.target.value.toLowerCase())) {
                      ids.push(node.id);
                    }
                    if (node.children) ids.push(...findMatchingIds(node.children));
                  }
                  return ids;
                };
                const matchingIds = findMatchingIds(tree);
                matchingIds.forEach(id => collectAncestors(tree, id, []));
                if (newExpanded.size > 0) setExpandedNodes(newExpanded);
              }
            }}
            className="input-field text-sm"
            />
          </div>
          <select
            value={namespace}
            onChange={(e) => { setNamespace(e.target.value); setExpandedNodes(new Set()); }}
            className="select-field text-sm w-32"
          >
            <option value="default">系统标签</option>
            <option value="散测入学">散测标签</option>
          </select>
        </div>

        {/* Tree Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : tree.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">暂无标签数据</div>
          ) : (
            <div className="border border-border rounded-xl p-2">
              {tree.map((node) => renderTreeNode(node))}
            </div>
          )}
        </div>

        {/* Selected Tags Preview */}
        {selectedTagId && (
          <div className="px-4 py-3 border-t border-border bg-muted/30">
            <div className="flex flex-wrap gap-1.5">
              {(() => {
                const findTagName = (nodes: KnowledgeTagNode[], targetId: string): string | null => {
                  for (const node of nodes) {
                    if (node.id === targetId) return node.name;
                    if (node.children) {
                      const found = findTagName(node.children, targetId);
                      if (found) return found;
                    }
                  }
                  return null;
                };
                const name = findTagName(tree, selectedTagId) || selectedTagId;
                return (
                  <span
                    key={selectedTagId}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs"
                  >
                    <Tag className="w-3 h-3" />
                    {name}
                  </span>
                );
              })()}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={handleClose} className="border-border hover:bg-muted rounded-xl">
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedTagId} className="bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl">
            确认打标签
          </Button>
        </div>
      </div>
    </div>
  );
}
