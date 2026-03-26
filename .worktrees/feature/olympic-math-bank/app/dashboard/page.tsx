import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BookOpen, CheckCircle, Upload, Clock } from 'lucide-react';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  
  // 获取统计数据
  const totalQuestions = await prisma.question.count();
  const pendingReview = await prisma.question.count({ where: { status: 'PENDING' } });
  const approvedQuestions = await prisma.question.count({ where: { status: 'APPROVED' } });
  const recentImports = await prisma.importJob.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">仪表盘</h2>
      <p className="text-slate-600">欢迎回来，{session?.user?.name || session?.user?.email}</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <BookOpen className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">总题目数</p>
              <p className="text-2xl font-bold">{totalQuestions}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">待审核</p>
              <p className="text-2xl font-bold">{pendingReview}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">已通过</p>
              <p className="text-2xl font-bold">{approvedQuestions}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Upload className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">近7天导入</p>
              <p className="text-2xl font-bold">{recentImports}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <Link href="/dashboard/questions/new">
          <Button>录入新题目</Button>
        </Link>
        <Link href="/dashboard/import">
          <Button variant="outline">批量导入</Button>
        </Link>
      </div>
    </div>
  );
}
