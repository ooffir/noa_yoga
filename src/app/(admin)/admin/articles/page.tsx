import { Suspense } from "react";
import { ArticlesManager } from "@/components/admin/articles-manager";
import { PageLoader } from "@/components/ui/loading";

export const dynamic = "force-dynamic";

export default function AdminArticlesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-sage-900 mb-6">ניהול כתבות</h1>
      <Suspense fallback={<PageLoader />}>
        <ArticlesManager />
      </Suspense>
    </div>
  );
}
