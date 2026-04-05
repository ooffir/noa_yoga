import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-sage-100 bg-white p-4 shadow-sm">
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-bold text-sage-900">התחברות</h1>
          <p className="mt-1 text-sm text-sage-500">ברוכות הבאות ל-Noa Yogis</p>
        </div>
        <SignIn
          path="/sign-in"
          routing="path"
          signUpUrl="/sign-up"
          forceRedirectUrl="/"
          fallbackRedirectUrl="/"
        />
      </div>
    </div>
  );
}
