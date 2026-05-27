import Link from "next/link";

export default function StaffRegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Staff Registration
        </h1>
        <p className="text-gray-500 mt-2 mb-6">
          Staff accounts are created by your town administrator. Ask your
          admin for an invite link to set up your account.
        </p>
        <p className="text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/staff/login" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
