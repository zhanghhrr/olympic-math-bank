'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  BookOpen,
  Upload,
  CheckCircle,
  Tags,
  Layers,
  Settings,
  LogOut,
  BookMarked,
} from 'lucide-react';
import { signOut } from 'next-auth/react';

const navigation = [
  { name: '仪表盘', href: '/dashboard', icon: LayoutDashboard },
  { name: '题目管理', href: '/dashboard/questions', icon: BookOpen },
  { name: '导入题目', href: '/dashboard/import', icon: Upload },
  { name: '审核中心', href: '/dashboard/review', icon: CheckCircle },
  { name: '基础标签', href: '/dashboard/tags', icon: Tags },
  { name: '知识标签', href: '/dashboard/knowledge-tags', icon: Layers },
  { name: '系统设置', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar({ user }: { user: any }) {
  const pathname = usePathname();

  return (
    <div className="fixed left-0 top-0 h-full w-60 bg-surface border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-5 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl terracotta-accent flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow duration-200">
            <BookMarked className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground tracking-tight">
              奥数题库
            </h1>
            <p className="text-xs text-muted-foreground">管理系统</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="px-3 py-4 space-y-1 flex-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                isActive
                  ? 'sidebar-active shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className={cn('w-5 h-5', isActive ? '' : 'opacity-70')} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="p-3 border-t border-border">
        <div className="px-4 py-3 mb-2 rounded-xl bg-muted/60">
          <p className="text-sm font-medium text-foreground truncate">
            {user?.name || '用户'}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {user?.email}
          </p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 px-4 py-2.5 w-full text-sm font-medium text-muted-foreground hover:bg-error/5 hover:text-error rounded-xl transition-all duration-200"
        >
          <LogOut className="w-5 h-5" />
          退出登录
        </button>
      </div>
    </div>
  );
}
