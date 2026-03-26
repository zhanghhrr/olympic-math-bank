import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <main className="text-center">
        <h1 className="text-4xl font-bold mb-4">奥数题库管理系统</h1>
        <p className="text-slate-600 mb-8">面向教研人员的题库录入与管理系统</p>
        <Button>开始使用</Button>
      </main>
    </div>
  );
}
