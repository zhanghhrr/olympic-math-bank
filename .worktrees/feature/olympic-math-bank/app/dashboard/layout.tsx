import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-background warm-gradient">
      <Sidebar user={session.user} />
      <div className="ml-60 h-screen overflow-hidden">
        <main className="h-full">{children}</main>
      </div>
    </div>
  );
}
