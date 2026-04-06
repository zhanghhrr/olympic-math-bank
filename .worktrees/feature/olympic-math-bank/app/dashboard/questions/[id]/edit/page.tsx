'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { QuestionForm } from '@/components/question/question-form';
import { ArrowLeft } from 'lucide-react';

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
  knowledgeTags: { knowledgeTagId: string }[];
}

export default function EditQuestionPage() {
  const router = useRouter();
  const params = useParams();
  const [question, setQuestion] = useState<Question | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/questions/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        router.push('/dashboard/questions');
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
    <div className="h-full overflow-y-auto space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/questions">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
        </Link>
        <h2 className="text-2xl font-bold">编辑题目</h2>
      </div>
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
          knowledgeTagIds: question.knowledgeTags.map((t) => t.knowledgeTagId),
        }}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
