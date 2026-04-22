"use client";

import { useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Calendar, CreditCard, History, X, Ticket, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { CancelBookingDialog } from "@/components/schedule/cancel-booking-dialog";
import { EmailPreferencesCard } from "@/components/profile/email-preferences-card";

interface BookingData {
  id: string;
  status: string;
  classInstance: {
    date: string;
    startTime: string;
    endTime: string;
    classDefinition: { title: string; instructor: string };
  };
}

interface PunchCardData {
  id: string;
  totalCredits: number;
  remainingCredits: number;
  purchasedAt: string;
}

interface ProfileViewProps {
  user: { name: string; email: string };
  upcomingBookings: BookingData[];
  pastBookings: BookingData[];
  totalCredits: number;
  directCredits: number;
  punchCardCredits: number;
  punchCards: PunchCardData[];
  cancellationHoursBefore?: number;
  receiveEmails: boolean;
}

export function ProfileView({
  user,
  upcomingBookings,
  pastBookings,
  totalCredits,
  directCredits,
  punchCardCredits,
  punchCards,
  cancellationHoursBefore = 6,
  receiveEmails,
}: ProfileViewProps) {
  return (
    <div className="space-y-6">
      {/* יתרת שיעורים */}
      <Card id="credits" className="border-sage-200 bg-gradient-to-br from-sage-50 to-white rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-sage-600" />
            יתרת שיעורים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-5xl font-bold text-sage-700">{totalCredits}</span>
            <span className="text-sage-500">שיעורים</span>
          </div>

          <div className="flex gap-4 text-xs text-sage-400 mb-5">
            {directCredits > 0 && <span>{directCredits} קרדיטים ישירים</span>}
            {punchCardCredits > 0 && (
              <span className="flex items-center gap-1">
                <CreditCard className="h-3 w-3" />
                {punchCardCredits} מכרטיסייה
              </span>
            )}
          </div>

          {punchCards.length > 0 && (
            <div className="space-y-2 mb-5">
              {punchCards.map((pc) => (
                <div
                  key={pc.id}
                  className="flex justify-between text-sm text-sage-600 bg-white rounded-2xl px-3 py-2 border border-sage-100"
                >
                  <span>{pc.remainingCredits}/{pc.totalCredits} קרדיטים</span>
                  <span className="text-sage-400">
                    נרכש {format(new Date(pc.purchasedAt), "d בMMMM yyyy", { locale: he })}
                  </span>
                </div>
              ))}
            </div>
          )}

          <Link href="/pricing">
            <Button className="rounded-2xl gap-2">
              <ShoppingCart className="h-4 w-4" />
              טעינת קרדיטים
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* שיעורים קרובים */}
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-sage-600" />
            שיעורים קרובים ({upcomingBookings.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingBookings.length === 0 ? (
            <p className="text-sage-400 text-sm py-4 text-center">
              אין שיעורים קרובים.{" "}
              <Link href="/schedule" className="text-sage-600 underline">צפייה במערכת השעות</Link>
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingBookings.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  canCancel
                  cancellationHoursBefore={cancellationHoursBefore}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* היסטוריית שיעורים */}
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-sage-600" />
            היסטוריית שיעורים
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pastBookings.length === 0 ? (
            <p className="text-sage-400 text-sm py-4 text-center">אין שיעורים קודמים.</p>
          ) : (
            <div className="space-y-3">
              {pastBookings.map((booking) => (
                <BookingRow key={booking.id} booking={booking} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* העדפות תקשורת */}
      <EmailPreferencesCard initialValue={receiveEmails} />
    </div>
  );
}

function BookingRow({
  booking,
  canCancel,
  cancellationHoursBefore = 6,
}: {
  booking: BookingData;
  canCancel?: boolean;
  cancellationHoursBefore?: number;
}) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const ci = booking.classInstance;

  return (
    <>
      <div className="flex items-center justify-between rounded-2xl border border-sage-100 bg-sage-50/50 px-4 py-3">
        <div>
          <p className="font-medium text-sage-900 text-sm">{ci.classDefinition.title}</p>
          <p className="text-xs text-sage-500">
            {format(new Date(ci.date), "EEEE, d בMMMM", { locale: he })} · {ci.startTime} – {ci.endTime} · {ci.classDefinition.instructor}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {booking.status === "CANCELLED" && (
            <Badge className="bg-red-50 text-red-500 border border-red-200 rounded-full">בוטל</Badge>
          )}
          {canCancel && booking.status === "CONFIRMED" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCancelOpen(true)}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {canCancel && (
        <CancelBookingDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          bookingId={booking.id}
          classTitle={ci.classDefinition.title}
          classDate={ci.date}
          classStartTime={ci.startTime}
          cancellationHoursBefore={cancellationHoursBefore}
        />
      )}
    </>
  );
}
