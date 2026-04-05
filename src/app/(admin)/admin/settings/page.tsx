import { Suspense } from "react";
import { SettingsEditor } from "@/components/admin/settings-editor";
import { PageLoader } from "@/components/ui/loading";

export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-sage-900 mb-6">הגדרות אתר</h1>
      <Suspense fallback={<PageLoader />}>
        <SettingsEditor />
      </Suspense>
    </div>
  );
}
