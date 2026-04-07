"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageLoader, Spinner } from "@/components/ui/loading";
import { Plus, Pencil, Trash2, Eye, Upload, ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import toast from "react-hot-toast";
import Link from "next/link";

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  imageUrl: string;
}

export function ArticlesManager() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchArticles = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/articles");
      const data = await res.json();
      setArticles(Array.isArray(data) ? data : []);
    } catch {
      toast.error("שגיאה בטעינת כתבות");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  const resetForm = () => {
    setEditId(null);
    setTitle("");
    setContent("");
    setImageUrl("");
    setImagePreview("");
  };

  const openCreate = () => { resetForm(); setShowForm(true); };

  const openEdit = (a: Article) => {
    setEditId(a.id);
    setTitle(a.title);
    setContent(a.content);
    setImageUrl(a.imageUrl);
    setImagePreview(a.imageUrl);
    setShowForm(true);
  };

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

      setImageUrl(data.url);
      toast.success("התמונה הועלתה");
    } catch {
      toast.error("העלאה נכשלה");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!imageUrl) {
      toast.error("יש להעלות תמונה");
      return;
    }

    setSaving(true);

    try {
      const url = editId ? `/api/admin/articles/${editId}` : "/api/admin/articles";
      const method = editId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, imageUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "שגיאה");
        return;
      }

      toast.success(editId ? "הכתבה עודכנה" : "הכתבה פורסמה");
      setShowForm(false);
      resetForm();
      fetchArticles();
    } catch {
      toast.error("שגיאה");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("למחוק כתבה זו?")) return;
    try {
      const res = await fetch(`/api/admin/articles/${id}`, { method: "DELETE" });
      if (res.ok) { toast.success("הכתבה נמחקה"); fetchArticles(); }
    } catch { toast.error("מחיקה נכשלה"); }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-sage-500">{articles.length} כתבות</p>
        <Button onClick={openCreate} className="rounded-2xl gap-2">
          <Plus className="h-4 w-4" />
          כתבה חדשה
        </Button>
      </div>

      {articles.length === 0 ? (
        <Card className="rounded-3xl">
          <CardContent className="py-12 text-center text-sage-400">
            אין כתבות עדיין. לחצו על ״כתבה חדשה״ כדי להתחיל.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {articles.map((a) => (
            <Card key={a.id} className="rounded-3xl">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {a.imageUrl && (
                      <img src={a.imageUrl} alt="" className="h-12 w-16 shrink-0 rounded-xl object-cover" />
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-sage-900 text-sm truncate">{a.title}</p>
                      <p className="text-xs text-sage-400 truncate">/{a.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Link href={`/articles/${a.slug}`} target="_blank">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Eye className="h-3.5 w-3.5 text-sage-400" />
                      </Button>
                    </Link>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
                      <Pencil className="h-3.5 w-3.5 text-sage-400" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? "עריכת כתבה" : "כתבה חדשה"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">כותרת</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת הכתבה" required />
            </div>

            <div>
              <label className="text-sm font-medium text-sage-700 mb-2 block">תמונה ראשית</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

              {imagePreview ? (
                <div className="relative rounded-2xl overflow-hidden border border-sage-200">
                  <img src={imagePreview} alt="תצוגה מקדימה" className="w-full aspect-video object-cover" />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center bg-sage-950/30 text-white opacity-0 hover:opacity-100 transition-opacity"
                  >
                    <Upload className="h-6 w-6" />
                  </button>
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                      <Spinner className="h-6 w-6" />
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sage-200 bg-sage-50/50 py-10 text-sm text-sage-500 transition-colors hover:border-sage-300 hover:bg-sage-50"
                >
                  {uploading ? <Spinner className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                  {uploading ? "מעלה..." : "העלאת תמונה"}
                </button>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-sage-700 mb-1 block">תוכן הכתבה</label>
              <div className="mb-2 text-xs text-sage-400">
                ניתן לכתוב HTML: &lt;b&gt;מודגש&lt;/b&gt;, &lt;ul&gt;&lt;li&gt;...&lt;/li&gt;&lt;/ul&gt;, &lt;p&gt;פסקה&lt;/p&gt;
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="כתבו כאן את תוכן הכתבה..."
                rows={14}
                required
                className="flex w-full rounded-xl border border-sage-200 bg-white px-4 py-3 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 resize-y min-h-[200px]"
              />
            </div>

            <Button type="submit" className="w-full rounded-2xl" disabled={saving || uploading}>
              {saving ? <Spinner className="h-4 w-4" /> : editId ? "שמירת שינויים" : "פרסום כתבה"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
