"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader, Spinner } from "@/components/ui/loading";
import { Upload, ImageIcon, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

const ICON_OPTIONS = [
  "Heart", "Wind", "Flower2", "Sun", "Leaf", "Sparkles",
  "Star", "Moon", "Mountain", "Waves", "Eye", "Hand",
];

interface CardData {
  title: string;
  description: string;
  iconName: string;
}

export function SettingsEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCards, setSavingCards] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [heroTitle, setHeroTitle] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [cardsHeading, setCardsHeading] = useState("למה לתרגל איתנו");
  const [cardsSubheading, setCardsSubheading] = useState("");
  const [creditPrice, setCreditPrice] = useState(50);
  const [punchCardPrice, setPunchCardPrice] = useState(350);
  const [cancellationWindow, setCancellationWindow] = useState(6);
  const [aboutTitle, setAboutTitle] = useState("נעים להכיר");
  const [aboutSubtitle, setAboutSubtitle] = useState("");
  const [aboutContent, setAboutContent] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [cards, setCards] = useState<CardData[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const [settingsRes, cardsRes] = await Promise.all([
        fetch("/api/admin/settings"),
        fetch("/api/admin/feature-cards"),
      ]);
      const settings = await settingsRes.json();
      const cardsData = await cardsRes.json();

      if (settings.heroTitle != null) setHeroTitle(settings.heroTitle);
      if (settings.heroSubtitle != null) setHeroSubtitle(settings.heroSubtitle);
      if (settings.cardsHeading) setCardsHeading(settings.cardsHeading);
      if (settings.cardsSubheading != null) setCardsSubheading(settings.cardsSubheading);
      if (settings.creditPrice != null) setCreditPrice(settings.creditPrice);
      if (settings.punchCardPrice != null) setPunchCardPrice(settings.punchCardPrice);
      if (settings.cancellationWindow != null) setCancellationWindow(settings.cancellationWindow);
      if (settings.aboutTitle) setAboutTitle(settings.aboutTitle);
      if (settings.aboutSubtitle) setAboutSubtitle(settings.aboutSubtitle);
      if (settings.aboutContent) setAboutContent(settings.aboutContent);
      if (settings.profileImageUrl) {
        setProfileImageUrl(settings.profileImageUrl);
        setImagePreview(settings.profileImageUrl);
      }

      if (Array.isArray(cardsData) && cardsData.length > 0) {
        setCards(cardsData.map((c: any) => ({
          title: c.title, description: c.description, iconName: c.iconName,
        })));
      }
    } catch {
      toast.error("שגיאה בטעינת הגדרות");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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
      if (!res.ok) { toast.error(data.error || "העלאה נכשלה"); return; }
      setProfileImageUrl(data.url);
    } catch { toast.error("העלאה נכשלה"); }
    finally { setUploading(false); }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heroTitle, heroSubtitle, cardsHeading, cardsSubheading, creditPrice, punchCardPrice, cancellationWindow, aboutTitle, aboutSubtitle, aboutContent, profileImageUrl }),
      });
      if (!res.ok) { toast.error("שמירה נכשלה"); return; }
      toast.success("ההגדרות נשמרו");
    } catch { toast.error("שמירה נכשלה"); }
    finally { setSaving(false); }
  };

  const handleSaveCards = async () => {
    setSavingCards(true);
    try {
      const res = await fetch("/api/admin/feature-cards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards }),
      });
      if (!res.ok) { toast.error("שמירה נכשלה"); return; }
      toast.success("הכרטיסיות נשמרו");
    } catch { toast.error("שמירה נכשלה"); }
    finally { setSavingCards(false); }
  };

  const updateCard = (idx: number, field: keyof CardData, value: string) => {
    setCards((prev) => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const addCard = () => {
    if (cards.length >= 6) { toast.error("עד 6 כרטיסיות"); return; }
    setCards((prev) => [...prev, { title: "", description: "", iconName: "Heart" }]);
  };

  const removeCard = (idx: number) => {
    setCards((prev) => prev.filter((_, i) => i !== idx));
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* ── באנר ראשי ── */}
      <Card className="rounded-3xl">
        <CardHeader><CardTitle>באנר ראשי</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">כותרת ראשית</label>
            <Input value={heroTitle} onChange={(e) => setHeroTitle(e.target.value.slice(0, 100))} maxLength={100} placeholder="יוגה היא התנסות ישירה. המסע אל התודעה." />
            <p className="text-[11px] text-sage-400 mt-1">{heroTitle.length}/100</p>
          </div>
          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">תת-כותרת</label>
            <textarea value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value.slice(0, 150))} maxLength={150} rows={3} placeholder="תהליך של קילוף שכבות, חזרה פנימה..." className="flex w-full rounded-xl border border-sage-200 bg-white px-4 py-3 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 resize-none" />
            <p className="text-[11px] text-sage-400 mt-1">{heroSubtitle.length}/150</p>
          </div>
        </CardContent>
      </Card>

      {/* ── כותרת כרטיסיות ── */}
      <Card className="rounded-3xl">
        <CardHeader><CardTitle>כותרת אזור הכרטיסיות</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">כותרת</label>
            <Input value={cardsHeading} onChange={(e) => setCardsHeading(e.target.value)} placeholder="למה לתרגל איתנו" />
          </div>
          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">תת-כותרת</label>
            <Input value={cardsSubheading} onChange={(e) => setCardsSubheading(e.target.value)} placeholder="חוויית יוגה מקצועית ואישית..." />
          </div>
        </CardContent>
      </Card>

      {/* ── מחירון ── */}
      <Card className="rounded-3xl">
        <CardHeader><CardTitle>מחירון</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">מחיר קרדיט בודד (₪)</label>
            <Input type="number" min={0} value={creditPrice} onChange={(e) => setCreditPrice(parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">מחיר כרטיסייה (₪)</label>
            <Input type="number" min={0} value={punchCardPrice} onChange={(e) => setPunchCardPrice(parseInt(e.target.value) || 0)} />
          </div>
        </CardContent>
      </Card>

      {/* ── מדיניות ביטול ── */}
      <Card className="rounded-3xl">
        <CardHeader><CardTitle>מדיניות ביטול</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">
              חלון ביטול (בשעות)
            </label>
            <Input
              type="number"
              min={0}
              max={168}
              value={cancellationWindow}
              onChange={(e) => setCancellationWindow(parseInt(e.target.value) || 0)}
            />
            <p className="mt-2 text-xs text-sage-500 leading-relaxed">
              משתמשות שיבטלו את הרישום עד {cancellationWindow} שעות לפני השיעור
              יקבלו החזר קרדיט אוטומטי. ביטולים מאוחרים יותר — ללא החזר.
              הערך הזה מוצג גם לתלמידות בעמוד מערכת השעות.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── אודות ── */}
      <Card className="rounded-3xl">
        <CardHeader><CardTitle>אודות / נעים להכיר</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">כותרת</label>
            <Input value={aboutTitle} onChange={(e) => setAboutTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">תת-כותרת</label>
            <Input value={aboutSubtitle} onChange={(e) => setAboutSubtitle(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-sage-700 mb-2 block">תמונת פרופיל</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            {imagePreview ? (
              <div className="relative w-40 h-40 rounded-3xl overflow-hidden border border-sage-200">
                <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => fileRef.current?.click()} className="absolute inset-0 flex items-center justify-center bg-sage-950/30 text-white opacity-0 hover:opacity-100 transition-opacity">
                  <Upload className="h-5 w-5" />
                </button>
                {uploading && <div className="absolute inset-0 flex items-center justify-center bg-white/80"><Spinner className="h-5 w-5" /></div>}
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="flex h-40 w-40 items-center justify-center rounded-3xl border-2 border-dashed border-sage-200 bg-sage-50/50 text-sage-500 hover:border-sage-300">
                {uploading ? <Spinner className="h-5 w-5" /> : <ImageIcon className="h-6 w-6" />}
              </button>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-sage-700 mb-1 block">תוכן (ביוגרפיה)</label>
            <textarea value={aboutContent} onChange={(e) => setAboutContent(e.target.value)} rows={12} className="flex w-full rounded-xl border border-sage-200 bg-white px-4 py-3 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 resize-y min-h-[200px]" />
          </div>
          <Button onClick={handleSaveSettings} className="w-full rounded-2xl" disabled={saving || uploading}>
            {saving ? <Spinner className="h-4 w-4" /> : "שמירת הגדרות"}
          </Button>
        </CardContent>
      </Card>

      {/* ── כרטיסיות ── */}
      <Card className="rounded-3xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>כרטיסיות מאפיינים</CardTitle>
            <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={addCard}>
              <Plus className="h-3.5 w-3.5" /> הוספה
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {cards.length === 0 && (
            <p className="text-sm text-sage-400 text-center py-4">אין כרטיסיות. לחצו ״הוספה״ כדי להתחיל.</p>
          )}
          {cards.map((card, idx) => (
            <div key={idx} className="rounded-2xl border border-sage-100 bg-sage-50/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-sage-500">כרטיסייה #{idx + 1}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeCard(idx)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </Button>
              </div>
              <div>
                <label className="text-xs font-medium text-sage-600 mb-1 block">כותרת</label>
                <Input value={card.title} onChange={(e) => updateCard(idx, "title", e.target.value.slice(0, 30))} maxLength={30} placeholder="כותרת הכרטיסייה" />
                <p className="text-[10px] text-sage-400 mt-0.5">{card.title.length}/30</p>
              </div>
              <div>
                <label className="text-xs font-medium text-sage-600 mb-1 block">תיאור</label>
                <textarea value={card.description} onChange={(e) => updateCard(idx, "description", e.target.value.slice(0, 120))} maxLength={120} rows={2} className="flex w-full rounded-lg border border-sage-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 resize-none" />
                <p className="text-[10px] text-sage-400 mt-0.5">{card.description.length}/120</p>
              </div>
              <div>
                <label className="text-xs font-medium text-sage-600 mb-1 block">אייקון</label>
                <select value={card.iconName} onChange={(e) => updateCard(idx, "iconName", e.target.value)} className="flex h-10 w-full rounded-lg border border-sage-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500">
                  {ICON_OPTIONS.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <Button onClick={handleSaveCards} className="w-full rounded-2xl" disabled={savingCards}>
            {savingCards ? <Spinner className="h-4 w-4" /> : "שמירת כרטיסיות"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
