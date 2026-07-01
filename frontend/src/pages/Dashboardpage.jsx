import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/Useauthstore";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { admin, logout, isLoggingOut } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-white/40">Signed in as</p>
          <p className="text-white font-medium">{admin?.name}</p>
        </div>
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="text-sm text-white/70 hover:text-white border border-white/10 hover:border-white/30 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
        >
          {isLoggingOut ? "Signing out…" : "Log out"}
        </button>
      </header>

      <main className="p-6 space-y-10 max-w-2xl">
        <section>
          <h1 className="text-2xl font-semibold text-white mb-2">Projects</h1>
          <p className="text-white/50 text-sm">
            Your projects will show up here once the projects list is wired up.
          </p>
        </section>

        <RegisterUserForm />
      </main>
    </div>
  );
}

// Lets a signed-in admin create another user. Since /auth/register is a
// protected route, this only works while logged in.
function RegisterUserForm() {
  const { register, isRegistering } = useAuthStore();
  const [form, setForm] = useState({ name: "", password: "" });
  const [status, setStatus] = useState(null); // { type: 'error' | 'success', message }

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);

    if (!form.name || !form.password) {
      setStatus({ type: "error", message: "Enter a name and password." });
      return;
    }
    if (form.password.length < 6) {
      setStatus({
        type: "error",
        message: "Password must be at least 6 characters.",
      });
      return;
    }

    const result = await register(form);
    if (result.success) {
      setStatus({ type: "success", message: `User "${form.name}" created.` });
      setForm({ name: "", password: "" });
    } else {
      setStatus({ type: "error", message: result.error });
    }
  };

  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-1">Add a user</h2>
      <p className="text-white/50 text-sm mb-4">
        Create a login for a teammate.
      </p>

      <form
        onSubmit={handleSubmit}
        className="space-y-3 bg-white/5 border border-white/10 rounded-xl p-5 max-w-sm"
      >
        <div>
          <label
            htmlFor="reg-name"
            className="block text-xs font-medium text-white/60 mb-1.5"
          >
            Name
          </label>
          <input
            id="reg-name"
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
            className="w-full rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30 transition-colors"
            placeholder="jane"
          />
        </div>

        <div>
          <label
            htmlFor="reg-password"
            className="block text-xs font-medium text-white/60 mb-1.5"
          >
            Password
          </label>
          <input
            id="reg-password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            className="w-full rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30 transition-colors"
            placeholder="At least 6 characters"
          />
        </div>

        {status && (
          <p
            className={`text-sm rounded-lg px-3 py-2 border ${
              status.type === "error"
                ? "text-red-400 bg-red-500/10 border-red-500/20"
                : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
            }`}
          >
            {status.message}
          </p>
        )}

        <button
          type="submit"
          disabled={isRegistering}
          className="w-full rounded-lg bg-white text-neutral-950 text-sm font-medium py-2.5 hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRegistering ? "Creating…" : "Create user"}
        </button>
      </form>
    </section>
  );
}