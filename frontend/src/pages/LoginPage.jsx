import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/Useauthstore";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoggingIn } = useAuthStore();
  const [form, setForm] = useState({ name: "", password: "" });
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.name || !form.password) {
      setError("Enter your name and password.");
      return;
    }

    const result = await login(form);
    if (result.success) {
      navigate("/admin/dashboard", { replace: true });
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 mb-4">
            <span className="text-white font-semibold">S</span>
          </div>
          <h1 className="text-xl font-semibold text-white">Sign in</h1>
          <p className="text-sm text-white/50 mt-1">
            Access the site inspection dashboard
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 bg-white/5 border border-white/10 rounded-xl p-6"
        >
          <div>
            <label
              htmlFor="name"
              className="block text-xs font-medium text-white/60 mb-1.5"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="username"
              value={form.name}
              onChange={handleChange}
              className="w-full rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30 transition-colors"
              placeholder="jane"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-white/60 mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange}
              className="w-full rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full rounded-lg bg-white text-neutral-950 text-sm font-medium py-2.5 hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isLoggingIn ? (
              <>
                <span className="w-4 h-4 border-2 border-neutral-950/30 border-t-neutral-950 rounded-full animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}