"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageLoader, Spinner } from "@/components/ui/loading";
import { Search, Plus, Minus, CreditCard } from "lucide-react";
import toast from "react-hot-toast";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  role: "STUDENT" | "ADMIN";
  credits: number;
  directCredits: number;
  punchCardCredits: number;
  totalBookings: number;
}

export function UsersManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      toast.error("שגיאה בטעינת משתמשים");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const updateCredits = async (userId: string, delta: number) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    const newCredits = Math.max(0, user.directCredits + delta);
    setUpdatingId(userId);

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, credits: newCredits }),
      });

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  directCredits: newCredits,
                  credits: newCredits + u.punchCardCredits,
                }
              : u
          )
        );
        toast.success(`קרדיטים עודכנו: ${newCredits}`);
      }
    } catch {
      toast.error("עדכון נכשל");
    }
    setUpdatingId(null);
  };

  const setCreditsManually = async (userId: string, value: string) => {
    const num = parseInt(value);
    if (isNaN(num) || num < 0) return;

    setUpdatingId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, credits: num }),
      });

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? { ...u, directCredits: num, credits: num + u.punchCardCredits }
              : u
          )
        );
      }
    } catch {
      toast.error("עדכון נכשל");
    }
    setUpdatingId(null);
  };

  const filtered = users.filter(
    (u) =>
      !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם או אימייל..."
          className="pr-10"
        />
      </div>

      <p className="text-xs text-sage-400">
        רשימה של כל המשתמשים שנרשמו לאתר ({users.length}) — תלמידות + מנהלות. משתמשים חדשים נוספים אוטומטית כשהם נרשמים.
      </p>

      {filtered.length === 0 ? (
        <Card className="rounded-3xl">
          <CardContent className="py-12 text-center text-sage-400">
            לא נמצאו משתמשים
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((user) => (
            <Card key={user.id} className="rounded-3xl">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sage-900 text-sm truncate">
                        {user.name || "ללא שם"}
                      </p>
                      {user.role === "ADMIN" && (
                        <span className="shrink-0 rounded-full border border-sage-300 bg-sage-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sage-700">
                          מנהלת
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-sage-500 truncate">{user.email}</p>
                    <div className="flex gap-3 mt-1 text-xs text-sage-400">
                      <span>{user.totalBookings} הזמנות</span>
                      {user.punchCardCredits > 0 && (
                        <span className="flex items-center gap-1">
                          <CreditCard className="h-3 w-3" />
                          {user.punchCardCredits} כרטיסייה
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-xl"
                      onClick={() => updateCredits(user.id, -1)}
                      disabled={updatingId === user.id || user.directCredits <= 0}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>

                    <div className="text-center min-w-[3rem]">
                      <input
                        type="number"
                        min={0}
                        value={user.directCredits}
                        onChange={(e) => setCreditsManually(user.id, e.target.value)}
                        className="w-12 text-center text-lg font-bold text-sage-800 bg-transparent border-none focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <p className="text-[10px] text-sage-400 -mt-0.5">קרדיטים</p>
                    </div>

                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-xl"
                      onClick={() => updateCredits(user.id, 1)}
                      disabled={updatingId === user.id}
                    >
                      {updatingId === user.id ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
