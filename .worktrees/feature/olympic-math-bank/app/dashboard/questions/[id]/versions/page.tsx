'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, AlertTriangle, History } from 'lucide-react';

interface Version {
  id: string;
  version: number;
  content: string;
  answer: string;
  solution: string | null;
  changeLog: string | null;
  createdAt: string;
  createdBy: { name: string; email: string } | null;
}

export default function VersionHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const [versions, setVersions] = useState<Version[]>([]);
  const [filteredVersions, setFilteredVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState<[Version, Version] | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showMineOnly, setShowMineOnly] = useState(false);

  useEffect(() => {
    fetchVersions();
  }, [params.id]);

  useEffect(() => {
    if (!showMineOnly) {
      setFilteredVersions(versions);
    } else {
      // 只显示当前用户的版本（简化处理：只保留有实质变更的版本）
      setFilteredVersions(versions.filter(v => v.changeLog && v.changeLog !== '回滚'));
    }
  }, [showMineOnly, versions]);

  const fetchVersions = async () => {
    try {
      const res = await fetch(`/api/questions/${params.id}/versions`);
      const data = await res.json();
      setVersions(data.versions || []);
    } catch (error) {
      console.error('获取版本历史失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (versionId: string, versionNum: number) => {
    if (!confirm(`确定要回滚到版本 v${versionNum} 吗？当前内容将被保存为新版本。`)) return;

    setRestoring(versionId);
    try {
      const res = await fetch(`/api/questions/${params.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `已回滚到版本 v${versionNum}` });
        fetchVersions();
      } else {
        setMessage({ type: 'error', text: data.error || '回滚失败' });
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误，请重试' });
    }
    setRestoring(null);
  };

  const handleDiff = (v1: Version, v2: Version) => {
    setShowDiff([v1, v2]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-muted/30 p-6 animate-fade-in">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/questions/${params.id}/edit`}>
            <Button variant="outline" size="sm" className="border-border hover:bg-muted rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回编辑
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">版本历史</h2>
            <p className="text-sm text-muted-foreground">
              共 {versions.length} 个版本 · 系统自动保存每次编辑历史
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={showMineOnly}
              onChange={(e) => setShowMineOnly(e.target.checked)}
              className="w-4 h-4 rounded text-primary"
            />
            <span className="text-sm text-muted-foreground">仅显示有变更的版本</span>
          </label>
        </div>

        {message && (
          <div className={`p-4 rounded-xl border ${
            message.type === 'success' ? 'bg-success/10 border-success/20 text-success' : 'bg-error/10 border-error/20 text-error'
          }`}>
            {message.type === 'success' ? '✓' : '✗'} {message.text}
            <button onClick={() => setMessage(null)} className="ml-4 underline text-sm">关闭</button>
          </div>
        )}

        {filteredVersions.length === 0 ? (
          <div className="card-elevated p-12 text-center">
            <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">暂无版本历史</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredVersions.map((version, idx) => (
              <div key={version.id} className="card-elevated p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="badge type-choice">v{version.version}</span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(version.createdAt).toLocaleString('zh-CN')}
                      </span>
                      {version.createdBy && (
                        <span className="text-sm text-muted-foreground">
                          · {version.createdBy.name}
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-foreground mb-3">
                      {version.changeLog || '未知变更'}
                    </p>

                    <div className="bg-muted/50 rounded-xl p-3">
                      <p className="text-xs text-muted-foreground mb-1">题干预览（前80字符）：</p>
                      <p className="text-sm text-foreground line-clamp-2">
                        {version.content.substring(0, 80)}{version.content.length > 80 ? '...' : ''}
                      </p>
                      {version.answer && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1">答案预览：</p>
                          <p className="text-sm text-foreground line-clamp-1">
                            {version.answer.substring(0, 60)}{version.answer.length > 60 ? '...' : ''}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {idx < filteredVersions.length - 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDiff(version, filteredVersions[idx + 1])}
                        className="text-muted-foreground hover:text-foreground rounded-xl text-xs"
                      >
                        与前版对比
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(version.id, version.version)}
                      disabled={restoring === version.id}
                      className="border-border hover:bg-muted rounded-xl"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      {restoring === version.id ? '回滚中...' : '回滚'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 对比弹窗 */}
        {showDiff && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-surface rounded-xl p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">
                  版本对比：v{showDiff[0].version} vs v{showDiff[1].version}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setShowDiff(null)} className="rounded-xl">
                  关闭
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">当前版本 (v{showDiff[0].version})</h4>
                  <div className="bg-muted/30 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground mb-1">题干：</p>
                    <p className="text-sm whitespace-pre-wrap">{showDiff[0].content}</p>
                    {showDiff[0].answer && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-1">答案：</p>
                        <p className="text-sm">{showDiff[0].answer}</p>
                      </div>
                    )}
                    {showDiff[0].solution && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-1">解析：</p>
                        <p className="text-sm whitespace-pre-wrap">{showDiff[0].solution}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">旧版本 (v{showDiff[1].version})</h4>
                  <div className="bg-muted/30 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground mb-1">题干：</p>
                    <p className="text-sm whitespace-pre-wrap">{showDiff[1].content}</p>
                    {showDiff[1].answer && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-1">答案：</p>
                        <p className="text-sm">{showDiff[1].answer}</p>
                      </div>
                    )}
                    {showDiff[1].solution && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-1">解析：</p>
                        <p className="text-sm whitespace-pre-wrap">{showDiff[1].solution}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
