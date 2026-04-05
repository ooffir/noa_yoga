import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-sage-100 bg-white p-4 shadow-sm">
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-bold text-sage-900">הרשמה</h1>
          <p className="mt-1 text-sm text-sage-500">יצירת חשבון חדש ל-Noa Yogis</p>
        </div>
        <SignUp
          path="/sign-up"
          routing="path"
          signInUrl="/sign-in"
          forceRedirectUrl="/"
          fallbackRedirectUrl="/"
        />
      </div>
    </div>
  );
}
