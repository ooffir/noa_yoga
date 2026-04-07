"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";
import toast from "react-hot-toast";

interface Props {
  workshopId: string;
}

export function WorkshopRegisterButton({ workshopId }: Props) {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const handleRegister = async () => {
    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/workshops/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workshopId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "ההרשמה נכשלה");
        return;
      }

      toast.success(data.message);
      setRegistered(true);
      router.refresh();
    } catch {
      toast.error("משהו השתבש, נסו שוב");
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <span className="rounded-2xl bg-sage-100 px-4 py-2 text-sm font-medium text-sage-700">
        נרשמת בהצלחה ✓
      </span>
    );
  }

  return (
    <Button
      onClick={handleRegister}
      disabled={loading}
      className="rounded-2xl text-sm"
    >
      {loading ? <Spinner className="h-4 w-4" /> : "הירשמו ושלמו"}
    </Button>
  );
}
