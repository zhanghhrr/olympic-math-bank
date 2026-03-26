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
  Settings,
  LogOut,
} from 'lucide-react';
import { signOut } from 'next-auth/react';

const navigation = [
  { name: '仪表盘', href: '/dashboard', icon: LayoutDashboard },
  { name: '题目管理', href: '/dashboard/questions', icon: BookOpen },
  { name: '导入题目', href: '/dashboard/import', icon: Upload },
  { name: '审核中心', href: '/dashboard/review', icon: CheckCircle },
  { name: '标签管理', href: '/dashboard/tags', icon: Tags },
  { name: '系统设置', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar({ user }: { user: any }) {
  const pathname = usePathname();

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 flex flex-col">
      <div className="p-6">
        <h1 className="text-xl font-bold text-slate-900">奥数题库系统</h1>
      </div>
      <nav className="px-4 space-y-1 flex-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-200">
        <div className="px-4 py-2 text-sm text-slate-600">
          {user?.name || user?.email}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 px-4 py-3 w-full text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <LogOut className="w-5 h-5" />
          退出登录
        </button>
      </div>
    </div>
  );
}
