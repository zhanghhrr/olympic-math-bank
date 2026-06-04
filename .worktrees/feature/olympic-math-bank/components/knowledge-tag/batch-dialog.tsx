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
  onConfirm: (selectedTagIds: string[]) => void;
}

export function BatchTagDialog({ isOpen, onClose, onConfirm }: BatchTagDialogProps) {
  const [tree, setTree] = useState<KnowledgeTagNode[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/knowledge-tags/tree')
        .then((res) => res.json())
        .then((data) => {
          setTree(data.tree || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [isOpen]);

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
    const newSelected = new Set(selectedTagIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTagIds(newSelected);
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selectedTagIds));
    setSelectedTagIds(new Set());
    onClose();
  };

  const handleClose = () => {
    setSelectedTagIds(new Set());
    setExpandedNodes(new Set());
    onClose();
  };

  // 递归渲染树节点
  const renderTreeNode = (node: KnowledgeTagNode, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedTagIds.has(node.id);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-lg text-foreground">批量打标签</h3>
            <p className="text-sm text-muted-foreground">
              已选择 {selectedTagIds.size} 个标签（替换现有标签）
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-muted rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
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
        {selectedTagIds.size > 0 && (
          <div className="px-4 py-3 border-t border-border bg-muted/30">
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selectedTagIds).map((id) => {
                // 找到对应的标签名称
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
                const name = findTagName(tree, id) || id;
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs"
                  >
                    <Tag className="w-3 h-3" />
                    {name}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={handleClose} className="border-border hover:bg-muted rounded-xl">
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={selectedTagIds.size === 0} className="bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl">
            确认打标签
          </Button>
        </div>
      </div>
    </div>
  );
}
