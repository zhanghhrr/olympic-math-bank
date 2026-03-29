'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Trash2, Tag } from 'lucide-react';

interface TagItem {
  id: string;
  name: string;
  type: string;
  description: string | null;
  order: number;
  _count: {
    questions: number;
  };
}

const typeLabels: Record<string, string> = {
  GRADE: '年级',
  DIFFICULTY: '难度',
  KNOWLEDGE: '知识点',
  COMPETITION: '竞赛类型',
};

const typeColors: Record<string, string> = {
  GRADE: 'bg-blue-100 text-blue-700',
  DIFFICULTY: 'bg-yellow-100 text-yellow-700',
  KNOWLEDGE: 'bg-green-100 text-green-700',
  COMPETITION: 'bg-purple-100 text-purple-700',
};

export default function TagsPage() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'KNOWLEDGE',
    description: '',
    order: 0,
  });

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags');
      const data = await res.json();
      setTags(data.tags || []);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingTag ? `/api/tags/${editingTag.id}` : '/api/tags';
      const method = editingTag ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setShowModal(false);
        setEditingTag(null);
        setFormData({ name: '', type: 'KNOWLEDGE', description: '', order: 0 });
        fetchTags();
      } else {
        const error = await res.json();
        alert(error.error || '操作失败');
      }
    } catch (error) {
      alert('操作出错');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个标签吗？')) return;

    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchTags();
      } else {
        const error = await res.json();
        alert(error.error || '删除失败');
      }
    } catch (error) {
      alert('删除出错');
    }
  };

  const openEditModal = (tag: TagItem) => {
    setEditingTag(tag);
    setFormData({
      name: tag.name,
      type: tag.type,
      description: tag.description || '',
      order: tag.order,
    });
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingTag(null);
    setFormData({ name: '', type: 'KNOWLEDGE', description: '', order: 0 });
    setShowModal(true);
  };

  // 按类型分组
  const groupedTags = tags.reduce((acc, tag) => {
    if (!acc[tag.type]) acc[tag.type] = [];
    acc[tag.type].push(tag);
    return acc;
  }, {} as Record<string, TagItem[]>);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">标签管理</h2>
        </div>
        <div className="text-center py-12 text-slate-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">标签管理</h2>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" />
          新建标签
        </Button>
      </div>

      {/* 标签列表 */}
      <div className="space-y-6">
        {Object.entries(groupedTags).map(([type, typeTags]) => (
          <div key={type} className="bg-white rounded-lg border">
            <div className="px-4 py-3 border-b bg-slate-50">
              <h3 className="font-medium text-slate-700">
                {typeLabels[type] || type}
                <span className="ml-2 text-sm text-slate-500">({typeTags.length})</span>
              </h3>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap gap-3">
                {typeTags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-slate-50"
                  >
                    <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[tag.type] || 'bg-gray-100'}`}>
                      {tag.name}
                    </span>
                    {tag.description && (
                      <span className="text-xs text-slate-500">{tag.description}</span>
                    )}
                    <span className="text-xs text-slate-400">({tag._count.questions}题)</span>
                    <button
                      onClick={() => openEditModal(tag)}
                      className="p-1 hover:bg-slate-200 rounded"
                    >
                      <Edit2 className="w-3 h-3 text-slate-500" />
                    </button>
                    <button
                      onClick={() => handleDelete(tag.id)}
                      className="p-1 hover:bg-red-100 rounded"
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 创建/编辑模态框 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">
              {editingTag ? '编辑标签' : '新建标签'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">标签名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">类型</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="GRADE">年级</option>
                  <option value="DIFFICULTY">难度</option>
                  <option value="KNOWLEDGE">知识点</option>
                  <option value="COMPETITION">竞赛类型</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">描述</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="可选"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">排序</label>
                <input
                  type="number"
                  value={formData.order}
                  onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="submit">
                  {editingTag ? '保存' : '创建'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowModal(false)}
                >
                  取消
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
