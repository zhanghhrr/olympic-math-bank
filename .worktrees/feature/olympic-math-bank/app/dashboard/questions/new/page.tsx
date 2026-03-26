'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/questions">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
        </Link>
        <h2 className="text-2xl font-bold">新建题目</h2>
      </div>
      <QuestionForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </div>
  );
}
