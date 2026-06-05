import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AuthUser, setToken, removeToken, setStoredUser } from "@/lib/auth";
import { authApi } from "@/lib/api";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: AuthUser) => void;
  fetchProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,

      login: async (username: string, password: string) => {
        set({ isLoading: true });
        try {
          const { data } = await authApi.login(username, password);
          setToken(data.accessToken);
          setStoredUser(data.user);
          set({ user: data.user, token: data.accessToken, isLoading: false });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: () => {
        removeToken();
        set({ user: null, token: null });
      },

      setUser: (user: AuthUser) => set({ user }),

      fetchProfile: async () => {
        try {
          const { data } = await authApi.getProfile();
          set({ user: data });
        } catch {
          get().logout();
        }
      },
    }),
    { name: "auth-storage", partialize: (s) => ({ user: s.user, token: s.token }) }
  )
);
