import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";

export default function PaymentSuccessPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <Card className="w-full max-w-md text-center rounded-3xl">
        <CardContent className="pt-8 pb-6">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-sage-900 mb-2">
            התשלום בוצע בהצלחה!
          </h1>
          <p className="text-sage-500 mb-6">
            הקרדיטים נוספו לחשבון שלך.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/schedule">
              <Button className="rounded-2xl">הרשמה לשיעור</Button>
            </Link>
            <Link href="/profile">
              <Button variant="outline" className="rounded-2xl">הקרדיטים שלי</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
