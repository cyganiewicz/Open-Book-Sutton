"use client";

import { useState, useEffect } from "react";
import HelpBox from "@/components/admin/HelpBox";

interface StaffUser {
  id: string;
  email: string;
  name: string;
  department: string | null;
  capitalDepartments?: string[];
  emailVerified: boolean;
  createdAt: string;
}

interface Invite {
  id: string;
  email: string;
  token: string;
  used: boolean;
  createdAt: string;
}

interface Town {
  id: string;
  name: string;
  slug: string;
  allowedDomains: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [town, setTown] = useState<Town | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [copiedResetLink, setCopiedResetLink] = useState<string | null>(null);

  const [showDomainForm, setShowDomainForm] = useState(false);
  const [domains, setDomains] = useState("");
  const [savingDomains, setSavingDomains] = useState(false);

  async function loadData() {
    try {
      const [usersRes, invitesRes, townsRes] = await Promise.all([
        fetch("/api/staff/users"),
        fetch("/api/staff/invites"),
        fetch("/api/towns"),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (invitesRes.ok) setInvites(await invitesRes.json());
      const towns = await townsRes.json();
      if (towns.length > 0) {
        setTown(towns[0]);
        setDomains(towns[0].allowedDomains || "");
      }
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/staff/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create invite");
        return;
      }

      setInviteEmail("");
      await loadData();
      if (data.emailed) {
        setSuccess(`Invitation emailed to ${data.email}.`);
      } else {
        // Email couldn't go out: keep the old copy-the-link behavior as a safety net
        const link = `${window.location.origin}/staff/join?token=${data.token}`;
        setCopiedToken(data.token);
        try { await navigator.clipboard.writeText(link); } catch { /* ignore */ }
        setError(`Invite created for ${data.email}, but the email couldn't be sent (${data.emailError}). The link was copied to your clipboard so you can send it yourself. Check Admin → Email.`);
      }
      setTimeout(() => setSuccess(""), 6000);
    } catch {
      setError("Failed to create invite");
    } finally {
      setInviting(false);
    }
  };

  const handleResendInvite = async (invite: Invite) => {
    setError(""); setSuccess("");
    try {
      const res = await fetch(`/api/staff/invites/${invite.id}/resend`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Could not resend"); return; }
      if (data.emailed) setSuccess(`Invitation re-sent to ${invite.email}.`);
      else setError(`The email couldn't be sent (${data.emailError}). Use Copy Link instead.`);
      setTimeout(() => setSuccess(""), 6000);
    } catch { setError("Could not resend"); }
  };

  const handleCopyLink = async (token: string) => {
    const link = `${window.location.origin}/staff/join?token=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleDeleteUser = async (user: StaffUser) => {
    if (!confirm(`Remove ${user.name} (${user.email})? They will lose access to the staff portal.`))
      return;
    setDeleting(user.id);
    setError("");

    try {
      const res = await fetch(`/api/staff/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to remove user");
        return;
      }
      await loadData();
    } catch {
      setError("Failed to remove user");
    } finally {
      setDeleting(null);
    }
  };

  const handleResetPassword = async (user: StaffUser) => {
    setResetting(user.id);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/staff/users/${user.id}/reset`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create reset link");
        return;
      }

      if (data.emailed) {
        setSuccess(`A password reset link was emailed to ${user.email}.`);
      } else {
        const link = `${window.location.origin}/staff/reset?token=${data.resetToken}`;
        setCopiedResetLink(user.id);
        try { await navigator.clipboard.writeText(link); } catch { /* ignore */ }
        setError(`The reset email couldn't be sent (${data.emailError}). The link was copied to your clipboard instead.`);
      }
      setTimeout(() => {
        setSuccess("");
        setCopiedResetLink(null);
      }, 5000);
    } catch {
      setError("Failed to create reset link");
    } finally {
      setResetting(null);
    }
  };

  const handleSaveDomains = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!town) return;
    setSavingDomains(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/towns/${town.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedDomains: domains.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save domains");
        return;
      }

      const updated = await res.json();
      setTown(updated);
      setShowDomainForm(false);
      setSuccess("Allowed email domains updated");
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to save domains");
    } finally {
      setSavingDomains(false);
    }
  };

  const pendingInvites = invites.filter((i) => !i.used);
  const allowedDomainsList = town?.allowedDomains
    ? town.allowedDomains.split(",").map((d) => d.trim()).filter(Boolean)
    : [];

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff Users</h1>
        <p className="text-gray-500 mt-1">
          {users.length} active staff member{users.length !== 1 ? "s" : ""}
          {pendingInvites.length > 0 && `, ${pendingInvites.length} pending invite${pendingInvites.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      <HelpBox variant="info">
        <p>
          Enter a staff member&apos;s email below and OpenBook emails them a
          personal link to create their account. You can resend it any time.
          Without an invitation, nobody can register.
        </p>
      </HelpBox>

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {success && <p className="text-sm text-emerald-600" role="status">{success}</p>}

      <form onSubmit={handleInvite} className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">Invite a staff member</h2>
        <div className="flex gap-3">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="name@townname.gov"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <button
            type="submit"
            disabled={inviting}
            className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {inviting ? "Sending..." : "Send Invite"}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          The invitation is emailed automatically. If email is ever unavailable, the link is copied to your clipboard instead.
        </p>
      </form>

      {pendingInvites.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Pending Invites ({pendingInvites.length})
          </h2>
          <div className="space-y-2">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                <div>
                  <span className="text-sm font-medium">{invite.email}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    Invited {new Date(invite.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-2">
                <button
                  onClick={() => handleResendInvite(invite)}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-md text-xs font-medium hover:bg-gray-50 transition-colors"
                >
                  Resend Email
                </button>
                <button
                  onClick={() => handleCopyLink(invite.token)}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-md text-xs font-medium hover:bg-gray-50 transition-colors"
                >
                  {copiedToken === invite.token ? "Copied!" : "Copy Link"}
                </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Allowed Email Domains
          </h2>
          <button
            onClick={() => setShowDomainForm(!showDomainForm)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {showDomainForm ? "Cancel" : "Edit"}
          </button>
        </div>

        {showDomainForm ? (
          <form onSubmit={handleSaveDomains} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <div>
              <label htmlFor="domains" className="block text-sm font-medium text-gray-700 mb-1">
                Allowed domains (comma-separated)
              </label>
              <input
                id="domains"
                type="text"
                value={domains}
                onChange={(e) => setDomains(e.target.value)}
                placeholder="e.g., townname.gov, town.sutton.ma.us"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Only emails from these domains can be invited.
                Leave blank to allow any email. Example: <code className="bg-gray-100 px-1 rounded">town.sutton.ma.us, suttonma.gov</code>
              </p>
            </div>
            <button
              type="submit"
              disabled={savingDomains}
              className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {savingDomains ? "Saving..." : "Save Domains"}
            </button>
          </form>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4">
            {allowedDomainsList.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {allowedDomainsList.map((d) => (
                  <span
                    key={d}
                    className="inline-block px-2.5 py-1 bg-white border border-gray-200 rounded-md text-sm text-gray-700"
                  >
                    @{d}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                No domain restrictions — any email can be invited.
              </p>
            )}
          </div>
        )}
      </section>

      {users.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-500">No active staff users yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Invite your first staff member using the form above.
          </p>
        </div>
      ) : (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Active Users ({users.length})
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm" aria-label="Staff users">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600">Department</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600">Added</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{user.name}</td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3 text-gray-500">{user.department || "—"}
                      <p className="text-xs mt-0.5">{user.capitalDepartments && user.capitalDepartments.length > 0 ? <span className="text-emerald-700">Capital: {user.capitalDepartments.join(", ")}</span> : <a href="/admin/capital" className="text-amber-700 hover:underline">No capital department yet</a>}</p></td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right space-x-3">
                      <button
                        onClick={() => handleResetPassword(user)}
                        disabled={resetting === user.id}
                        className="text-blue-600 hover:text-blue-800 text-sm disabled:opacity-50"
                        aria-label={`Reset password for ${user.name}`}
                      >
                        {resetting === user.id ? "Sending..." : copiedResetLink === user.id ? "Link Copied!" : "Email Reset Link"}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user)}
                        disabled={deleting === user.id}
                        className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
                        aria-label={`Remove ${user.name}`}
                      >
                        {deleting === user.id ? "Removing..." : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
