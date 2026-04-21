"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";
import toast from "react-hot-toast";
import { generatePaymeSaleForWorkshop } from "@/actions/payme";

interface Props {
  workshopId: string;
}

export function WorkshopRegisterButton({ workshopId }: Props) {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [redirecting, setRedirecting] = useState(false);
  // Synchronous double-click guard — useState is batched, a useRef mutates
  // immediately so a second rapid click is blocked before it can fire the
  // server action and create a duplicate PENDING registration.
  const submittingRef = useRef(false);

  const handleRegister = () => {
    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;

    startTransition(async () => {
      const result = await generatePaymeSaleForWorkshop(workshopId);

      if (!result.ok) {
        toast.error(result.error);
        submittingRef.current = false;
        return;
      }

      toast.success("מעבירים לדף התשלום…");
      setRedirecting(true);
      window.location.href = result.url;
    });
  };

  const loading = pending || redirecting;

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
