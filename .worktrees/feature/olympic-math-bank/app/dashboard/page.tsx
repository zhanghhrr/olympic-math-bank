import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BookOpen, CheckCircle, Upload, Clock, ArrowRight, Sparkles } from 'lucide-react';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  // 获取统计数据
  const totalQuestions = await prisma.question.count();
  const pendingReview = await prisma.question.count({ where: { status: 'PENDING' } });
  const approvedQuestions = await prisma.question.count({ where: { status: 'APPROVED' } });
  const recentImports = await prisma.importJob.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } });

  const stats = [
    {
      label: '总题目数',
      value: totalQuestions,
      icon: BookOpen,
      bgColor: 'bg-primary/10',
      textColor: 'text-primary',
    },
    {
      label: '待审核',
      value: pendingReview,
      icon: Clock,
      bgColor: 'bg-warning/10',
      textColor: 'text-warning',
    },
    {
      label: '已通过',
      value: approvedQuestions,
      icon: CheckCircle,
      bgColor: 'bg-success/10',
      textColor: 'text-success',
    },
    {
      label: '近7天导入',
      value: recentImports,
      icon: Upload,
      bgColor: 'bg-secondary/10',
      textColor: 'text-secondary',
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Section */}
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-semibold text-foreground tracking-tight">
              欢迎回来
            </h2>
            <p className="text-muted-foreground mt-1">
              {session?.user?.name || session?.user?.email}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/5 border border-primary/10">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">系统运行正常</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={`card-elevated p-5 animate-fade-in stagger-${index + 1}`}
          >
            <div className="flex items-center gap-4">
              <div className={`p-3.5 rounded-xl ${stat.bgColor}`}>
                <stat.icon className={`w-6 h-6 ${stat.textColor}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-3xl font-semibold text-foreground mt-0.5">
                  {stat.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="card-elevated p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">快捷操作</h3>
        <div className="flex flex-wrap gap-4">
          <Link href="/dashboard/questions/new">
            <Button className="bg-primary hover:bg-primary-hover text-primary-foreground shadow-md hover:shadow-lg transition-all duration-200 gap-2 rounded-xl">
              <BookOpen className="w-4 h-4" />
              录入新题目
            </Button>
          </Link>
          <Link href="/dashboard/import">
            <Button
              variant="outline"
              className="border-border hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all duration-200 gap-2 rounded-xl"
            >
              <Upload className="w-4 h-4" />
              批量导入
            </Button>
          </Link>
          <Link href="/dashboard/review">
            <Button
              variant="ghost"
              className="hover:bg-primary/5 hover:text-primary transition-all duration-200 gap-2 rounded-xl"
            >
              <CheckCircle className="w-4 h-4" />
              审核中心
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Recent Activity Placeholder */}
      <div className="card-elevated p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">最近动态</h3>
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-muted flex items-center justify-center">
            <Clock className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">
            暂无最近动态
          </p>
        </div>
      </div>
    </div>
  );
}
