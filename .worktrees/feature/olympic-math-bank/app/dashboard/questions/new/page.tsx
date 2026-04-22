'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus } from 'lucide-react';
import { QuestionForm } from '@/components/question/question-form';

export default function NewQuestionPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        router.push('/dashboard/questions');
      } else {
        const error = await response.json();
        alert(error.error || '创建失败');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <h2 className="text-2xl font-bold text-foreground tracking-tight">新建题目</h2>
            <p className="text-sm text-muted-foreground">创建新的题目内容，支持 LaTeX 公式和图片</p>
          </div>
        </div>
        {/* Form Container */}
        <div className="card-elevated p-6">
          <QuestionForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
        </div>
      </div>
    </div>
  );
}
