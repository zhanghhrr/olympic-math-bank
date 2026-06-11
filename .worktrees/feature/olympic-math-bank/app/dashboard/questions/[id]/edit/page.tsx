'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { QuestionForm } from '@/components/question/question-form';
import { ArrowLeft, History, Save } from 'lucide-react';

interface Question {
  id: string;
  content: string;
  answer: string;
  solution: string | null;
  type: string;
  grade: string;
  difficulty: number;
  source: string | null;
  year: number | null;
  competition: string | null;
  tags: { tagId: string }[];
  knowledgeTagId: string | null;
}

export default function EditQuestionPage() {
  const router = useRouter();
  const params = useParams();
  const [question, setQuestion] = useState<Question | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const formDataRef = useRef<any>(null);

  useEffect(() => {
    fetch(`/api/questions/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.question) {
          setQuestion(data.question);
        }
        setLoading(false);
      });
  }, [params.id]);

  // 清理自动保存定时器
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // 自动保存：表单数据变化后 5 秒静默存为草稿
  const triggerAutoSave = useCallback((data: any) => {
    formDataRef.current = data;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setAutoSaveStatus('idle');

    autoSaveTimerRef.current = setTimeout(async () => {
      if (!formDataRef.current) return;
      setAutoSaveStatus('saving');
      try {
        const response = await fetch(`/api/questions/${params.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formDataRef.current),
        });
        if (response.ok) {
          setAutoSaveStatus('saved');
          setTimeout(() => setAutoSaveStatus('idle'), 2000);
        } else {
          setAutoSaveStatus('error');
        }
      } catch {
        setAutoSaveStatus('error');
      }
    }, 5000);
  }, [params.id]);

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/questions/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        if (data.__stay) {
          // "保存并继续编辑"：不跳转
          setAutoSaveStatus('saved');
          setTimeout(() => setAutoSaveStatus('idle'), 2000);
        } else {
          router.push('/dashboard/questions');
        }
      } else {
        const error = await response.json();
        alert(error.error || '更新失败');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">题目不存在</p>
        <Link href="/dashboard/questions">
          <Button className="mt-4">返回题目列表</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-muted/30 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/dashboard/questions">
            <Button variant="outline" size="sm" className="border-border hover:bg-muted rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">编辑题目</h2>
            <p className="text-sm text-muted-foreground">
              修改题目信息，系统自动保存历史版本
              {autoSaveStatus === 'saving' && <span className="ml-2 text-primary">● 自动保存中...</span>}
              {autoSaveStatus === 'saved' && <span className="ml-2 text-success">✓ 已自动保存</span>}
              {autoSaveStatus === 'error' && <span className="ml-2 text-error">✗ 自动保存失败</span>}
            </p>
          </div>
          <Link href={`/dashboard/questions/${question.id}/versions`}>
            <Button variant="outline" size="sm" className="border-border hover:bg-muted rounded-xl">
              <History className="w-4 h-4 mr-2" />
              版本历史
            </Button>
          </Link>
        </div>
        {/* Form Container */}
        <div className="card-elevated p-6">
          <QuestionForm
            initialData={{
              content: question.content,
              answer: question.answer,
              solution: question.solution || '',
              type: question.type,
              grade: question.grade,
              difficulty: question.difficulty,
              source: question.source || '',
              year: question.year || new Date().getFullYear(),
              competition: question.competition || '',
              tagIds: question.tags.map((t) => t.tagId),
              knowledgeTagId: question.knowledgeTagId || null,
            }}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            onFormChange={triggerAutoSave}
          />
        </div>
      </div>
    </div>
  );
}
