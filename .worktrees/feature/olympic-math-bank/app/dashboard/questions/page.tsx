import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function QuestionsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">题目管理</h2>
        <Link href="/dashboard/questions/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            新建题目
          </Button>
        </Link>
      </div>
      <p className="text-slate-600">题目列表功能开发中...</p>
    </div>
  );
}
