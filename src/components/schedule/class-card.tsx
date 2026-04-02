"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Clock, MapPin, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/loading";
import { formatTime } from "@/lib/utils";

interface ClassCardProps {
  classData: {
    id: string;
    title: string;
    description: string | null;
    instructor: string;
    date: string;
    startTime: string;
    endTime: string;
    location: string | null;
    isAvailable: boolean;
  };
}

export function ClassCard({ classData }: ClassCardProps) {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleBook = async () => {
    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classInstanceId: classData.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Booking failed");
        return;
      }

      if (data.type === "waitlist") {
        toast.success("Added to waitlist! We'll notify you if a spot opens.");
      } else {
        toast.success("Booking confirmed!");
      }

      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-sage-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-sage-900 truncate">
              {classData.title}
            </h4>
            <Badge variant={classData.isAvailable ? "available" : "full"}>
              {classData.isAvailable ? "Available" : "Full"}
            </Badge>
          </div>

          {classData.description && (
            <p className="text-sm text-sage-500 line-clamp-1 mb-2">
              {classData.description}
            </p>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-sage-500">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatTime(classData.startTime)} - {formatTime(classData.endTime)}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {classData.instructor}
            </span>
            {classData.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {classData.location}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0">
          <Button
            size="sm"
            variant={classData.isAvailable ? "default" : "outline"}
            onClick={handleBook}
            disabled={loading}
            className="min-w-[90px]"
          >
            {loading ? (
              <Spinner className="h-4 w-4" />
            ) : classData.isAvailable ? (
              "Book"
            ) : (
              "Waitlist"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
