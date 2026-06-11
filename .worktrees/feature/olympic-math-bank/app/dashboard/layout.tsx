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
      <div className="ml-60 h-screen overflow-hidden print-reset-h print:ml-0">
        <main className="h-full overflow-auto p-6 print-reset-h">{children}</main>
      </div>
    </div>
  );
}
