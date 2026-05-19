"use client";

import { useRouter } from "next/navigation";

export default function AdminLogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  };

  return (
    <button
      onClick={handleLogout}
      className="text-gray-500 hover:text-gray-700 text-sm"
      aria-label="Sign out"
    >
      Sign Out
    </button>
  );
}
