"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { Package, Shield, BarChart2, RefreshCw, AlertCircle } from "lucide-react";

const FEATURES = [
  { icon: Package, text: "Полный учёт основных средств" },
  { icon: ClipboardCheck, text: "Инвентаризация с QR-сканированием" },
  { icon: BarChart2, text: "Отчёты и аналитика в реальном времени" },
  { icon: RefreshCw, text: "Интеграция с 1С по OData API" },
];

function ClipboardCheck(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login, isLoading, user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(username, password);
      router.replace("/dashboard");
    } catch (err: any) {
      const msg = err.response?.data?.message;
      setError(typeof msg === "string" ? msg : "Неверный логин или пароль");
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[540px] flex-col justify-between p-12
        bg-gradient-to-br from-slate-900 via-primary-950 to-violet-950 relative overflow-hidden flex-shrink-0">

        {/* Decorative orbs */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-16 w-80 h-80 bg-violet-600/20 rounded-full blur-3xl" />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-base tracking-tight">IT Inventory</div>
            <div className="text-white/40 text-xs">Версия 2.0</div>
          </div>
        </div>

        {/* Headline */}
        <div className="relative space-y-6">
          <div>
            <h1 className="text-4xl font-extrabold text-white leading-tight tracking-tight">
              Корпоративный учёт<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-300 to-violet-300">
                основных средств
              </span>
            </h1>
            <p className="mt-4 text-white/50 text-base leading-relaxed">
              Современная платформа для инвентаризации и управления имуществом предприятия
            </p>
          </div>

          <ul className="space-y-3.5">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/70">
                <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary-300" />
                </div>
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="relative flex items-center gap-2 text-white/25 text-xs">
          <Shield className="w-3.5 h-3.5" />
          Защищённое соединение · TLS 1.3
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50 dark:bg-slate-950">
        <div className="w-full max-w-[400px] space-y-8">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 justify-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-600 to-violet-600 flex items-center justify-center shadow-glow">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div className="text-gray-900 dark:text-white font-bold text-lg tracking-tight">IT Inventory</div>
          </div>

          <div className="card p-8 animate-slideUp">
            <div className="mb-7">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Добро пожаловать</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1.5">Войдите в систему управления активами</p>
            </div>

            {error && (
              <div className="mb-5 flex items-start gap-3 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label">Имя пользователя</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="input"
                  placeholder="r.zhuman"
                  required
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Пароль</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full py-2.5 text-sm mt-1"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Вход...
                  </span>
                ) : "Войти в систему"}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-gray-100 dark:border-slate-800">
              <p className="text-xs text-gray-400 dark:text-slate-500 text-center">
                По умолчанию: <code className="font-mono text-gray-500 dark:text-slate-400">r.zhuman</code> / <code className="font-mono text-gray-500 dark:text-slate-400">Ktms2026!</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
