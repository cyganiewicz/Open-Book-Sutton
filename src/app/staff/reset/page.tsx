"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [email, setEmail] = useState("");
  const [valid, setValid] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setValid(false);
      setErrorMsg("No reset token provided.");
      return;
    }

    fetch(`/api/staff/reset?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setValid(false);
          setErrorMsg(data.error);
        } else {
          setValid(true);
          setEmail(data.email);
        }
      })
      .catch(() => {
        setValid(false);
        setErrorMsg("Failed to validate reset link.");
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/staff/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Reset failed");
        return;
      }

      setSuccess(true);
    } catch {
      setErrorMsg("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (valid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Validating reset link...</p>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Invalid Reset Link</h1>
          <p className="text-gray-500 mt-2">{errorMsg}</p>
          <Link href="/staff/login" className="text-blue-600 hover:underline text-sm mt-4 inline-block">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Password Reset</h1>
          <p className="text-gray-500 mt-2">Your password has been updated.</p>
          <Link
            href="/staff/login"
            className="mt-4 inline-block px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-center">
          Reset Password
        </h1>
        <p className="text-gray-500 text-center mt-1 mb-6">
          Set a new password for <strong>{email}</strong>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reset-password" className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={6}
            />
          </div>

          {errorMsg && <p className="text-sm text-red-600" role="alert">{errorMsg}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Updating..." : "Update Password"}
          </button>
        </form>

        <p className="text-sm text-gray-500 text-center mt-6">
          Remember your password?{" "}
          <Link href="/staff/login" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
