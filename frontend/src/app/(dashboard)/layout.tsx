"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import { Toaster } from "@/components/ui/Toaster";
import { useAuthStore } from "@/store/auth.store";
import { authApi } from "@/lib/api";
import { Package } from "lucide-react";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-950 gap-5">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-600 to-violet-600 flex items-center justify-center shadow-glow">
        <Package className="w-6 h-6 text-white" />
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-primary-400 dark:bg-primary-500 animate-bounceDot"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, setUser, logout } = useAuthStore();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // Наличие сессии больше нельзя определить чтением куки — она httpOnly.
  // Единственный достоверный способ: спросить профиль. Ответ 401 означает,
  // что сессии нет (интерцептор к этому моменту уже попробовал обновить токен).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await authApi.getProfile();
        if (!cancelled) {
          setUser(data);
          setChecking(false);
        }
      } catch {
        if (!cancelled) {
          logout();
          router.replace("/login");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (checking) return <LoadingScreen />;
  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
      <Toaster />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </SidebarProvider>
  );
}
