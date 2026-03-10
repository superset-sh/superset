/**
 * Landing Page - 미로그인 사용자용
 */
import { Link } from "@tanstack/react-router";

export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-900 text-white">
      <div className="text-center">
        <h1 className="text-5xl font-bold">Feature Atlas</h1>
        <p className="mt-2 text-lg text-slate-400">
          Build modular applications with pluggable features
        </p>
      </div>

      <div className="flex gap-4">
        <Link
          to="/sign-in"
          className="rounded-lg bg-blue-600 px-6 py-3 font-medium hover:bg-blue-500"
        >
          Sign In
        </Link>
        <Link
          to="/sign-up"
          className="rounded-lg border border-slate-600 px-6 py-3 font-medium hover:bg-slate-800"
        >
          Sign Up
        </Link>
      </div>
    </div>
  );
}
