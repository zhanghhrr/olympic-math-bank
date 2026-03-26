'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileImage, FileText } from 'lucide-react';

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<'image' | 'pdf'>('image');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('type', activeTab);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        alert('上传成功！');
        setFiles([]);
      } else {
        alert('上传失败');
      }
    } catch (error) {
      alert('上传出错');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">导入题目</h2>

      <div className="flex gap-4 border-b">
        <button
          onClick={() => setActiveTab('image')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'image'
              ? 'border-b-2 border-slate-900 text-slate-900'
              : 'text-slate-500'
          }`}
        >
          <FileImage className="w-4 h-4 inline mr-2" />
          图片导入
        </button>
        <button
          onClick={() => setActiveTab('pdf')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'pdf'
              ? 'border-b-2 border-slate-900 text-slate-900'
              : 'text-slate-500'
          }`}
        >
          <FileText className="w-4 h-4 inline mr-2" />
          PDF导入
        </button>
      </div>

      <div className="bg-white p-6 rounded-lg border">
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center">
          <Upload className="w-12 h-12 mx-auto text-slate-400 mb-4" />
          <p className="text-slate-600 mb-4">
            {activeTab === 'image'
              ? '选择图片文件（支持 JPG、PNG）'
              : '选择 PDF 文件'}
          </p>
          <input
            type="file"
            accept={activeTab === 'image' ? 'image/*' : '.pdf'}
            multiple={activeTab === 'image'}
            onChange={handleFileSelect}
            className="hidden"
            id="file-input"
          />
          <label htmlFor="file-input">
            <Button variant="outline" className="cursor-pointer" asChild>
              <span>选择文件</span>
            </Button>
          </label>
        </div>

        {files.length > 0 && (
          <div className="mt-6">
            <h3 className="font-medium mb-2">已选择文件：</h3>
            <ul className="space-y-2">
              {files.map((file, index) => (
                <li key={index} className="flex items-center gap-2 text-sm">
                  <span className="text-slate-600">{file.name}</span>
                  <span className="text-slate-400">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </li>
              ))}
            </ul>

            {uploading && (
              <div className="mt-4">
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-900 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm text-slate-600 mt-2">上传中...</p>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading ? '上传中...' : '开始上传'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setFiles([])}
                disabled={uploading}
              >
                清除
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-50 p-4 rounded-lg text-sm text-slate-600">
        <h3 className="font-medium mb-2">使用说明：</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>图片导入：支持批量上传多个题目图片</li>
          <li>PDF导入：支持多页PDF，系统会自动分割题目</li>
          <li>上传后系统会进行OCR识别，请在识别结果页面核对</li>
          <li>建议图片清晰，文字内容完整可见</li>
        </ul>
      </div>
    </div>
  );
}
