'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Save, User, Database, Bell, Settings, CheckCircle } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    siteName: '奥数题库系统',
    siteDescription: '小学奥数题目管理与智能导入系统',
    itemsPerPage: 20,
    enableReview: true,
    enableOCR: true,
    notificationEmail: '',
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    // 模拟保存
    await new Promise(resolve => setTimeout(resolve, 500));
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 max-w-4xl space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-foreground tracking-tight">系统设置</h2>
        <Button onClick={handleSave} disabled={loading} className="bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl">
          <Save className="w-4 h-4 mr-2" />
          {loading ? '保存中...' : '保存设置'}
        </Button>
      </div>

      {saved && (
        <div className="bg-success/10 border border-success/20 text-success px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          设置已保存！
        </div>
      )}

      <div className="space-y-6">
        {/* 基本信息 */}
        <div className="card-elevated p-6">
          <div className="flex items-center gap-3 mb-4">
            <Database className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">基本信息</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">系统名称</label>
              <input
                type="text"
                value={settings.siteName}
                onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">系统描述</label>
              <textarea
                value={settings.siteDescription}
                onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
                rows={2}
                className="input-field"
              />
            </div>
          </div>
        </div>

        {/* 功能设置 */}
        <div className="card-elevated p-6">
          <div className="flex items-center gap-3 mb-4">
            <Settings className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">功能设置</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">每页显示数量</label>
              <input
                type="number"
                value={settings.itemsPerPage}
                onChange={(e) => setSettings({ ...settings, itemsPerPage: parseInt(e.target.value) || 20 })}
                className="input-field"
                min={5}
                max={100}
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="enableReview"
                checked={settings.enableReview}
                onChange={(e) => setSettings({ ...settings, enableReview: e.target.checked })}
                className="w-4 h-4 rounded text-primary"
              />
              <label htmlFor="enableReview" className="text-sm text-foreground">启用审核流程</label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="enableOCR"
                checked={settings.enableOCR}
                onChange={(e) => setSettings({ ...settings, enableOCR: e.target.checked })}
                className="w-4 h-4 rounded text-primary"
              />
              <label htmlFor="enableOCR" className="text-sm text-foreground">启用OCR导入功能</label>
            </div>
          </div>
        </div>

        {/* 通知设置 */}
        <div className="card-elevated p-6">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">通知设置</h3>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">通知邮箱</label>
            <input
              type="email"
              value={settings.notificationEmail}
              onChange={(e) => setSettings({ ...settings, notificationEmail: e.target.value })}
              className="input-field"
              placeholder="用于接收系统通知的邮箱地址"
            />
          </div>
        </div>

        {/* 系统信息 */}
        <div className="bg-muted/50 rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">系统信息</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>版本</span>
              <span className="text-foreground">v0.1.0-alpha</span>
            </div>
            <div className="flex justify-between">
              <span>数据库</span>
              <span className="text-foreground">SQLite</span>
            </div>
            <div className="flex justify-between">
              <span>Next.js</span>
              <span className="text-foreground">16.2.1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
