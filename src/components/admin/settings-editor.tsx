"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader, Spinner } from "@/components/ui/loading";
import { Upload, ImageIcon } from "lucide-react";
import toast from "react-hot-toast";

export function SettingsEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aboutTitle, setAboutTitle] = useState("נעים להכיר");
  const [aboutSubtitle, setAboutSubtitle] = useState("");
  const [aboutContent, setAboutContent] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      if (data.aboutTitle) setAboutTitle(data.aboutTitle);
      if (data.aboutSubtitle) setAboutSubtitle(data.aboutSubtitle);
      if (data.aboutContent) setAboutContent(data.aboutContent);
      if (data.profileImageUrl) {
        setProfileImageUrl(data.profileImageUrl);
        setImagePreview(data.profileImageUrl);
      }
    } catch {
      toast.error("שגיאה בטעינת הגדרות");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImagePreview(URL.createObjectURL(file));
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "העלאה נכשלה");
        return;
      }

      setProfileImageUrl(data.url);
      toast.success("התמונה הועלתה");
    } catch {
      toast.error("העלאה נכשלה");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aboutTitle, aboutSubtitle, aboutContent, profileImageUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "שמירה נכשלה");
        return;
      }

      toast.success("ההגדרות נשמרו בהצלחה");
    } catch {
      toast.error("שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>אודות / נעים להכיר</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">כותרת</label>
            <Input value={aboutTitle} onChange={(e) => setAboutTitle(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">תת-כותרת</label>
            <Input value={aboutSubtitle} onChange={(e) => setAboutSubtitle(e.target.value)} placeholder="דרך של הקשבה, תרגול ונוכחות..." />
          </div>

          <div>
            <label className="text-sm font-medium text-sage-700 mb-2 block">תמונת פרופיל</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

            {imagePreview ? (
              <div className="relative w-40 h-40 rounded-3xl overflow-hidden border border-sage-200">
                <img src={imagePreview} alt="תצוגה מקדימה" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center bg-sage-950/30 text-white opacity-0 hover:opacity-100 transition-opacity"
                >
                  <Upload className="h-5 w-5" />
                </button>
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                    <Spinner className="h-5 w-5" />
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-40 w-40 items-center justify-center rounded-3xl border-2 border-dashed border-sage-200 bg-sage-50/50 text-sage-500 transition-colors hover:border-sage-300"
              >
                {uploading ? <Spinner className="h-5 w-5" /> : <ImageIcon className="h-6 w-6" />}
              </button>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">תוכן (ביוגרפיה)</label>
            <div className="mb-2 text-xs text-sage-400">כל שורה תוצג כפסקה נפרדת. ניתן לכתוב גם HTML.</div>
            <textarea
              value={aboutContent}
              onChange={(e) => setAboutContent(e.target.value)}
              rows={16}
              className="flex w-full rounded-xl border border-sage-200 bg-white px-4 py-3 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 resize-y min-h-[250px]"
            />
          </div>

          <Button onClick={handleSave} className="w-full rounded-2xl" disabled={saving || uploading}>
            {saving ? <Spinner className="h-4 w-4" /> : "שמירת שינויים"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
