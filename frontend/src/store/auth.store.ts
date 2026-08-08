import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AuthUser, setStoredUser, clearStoredUser } from "@/lib/auth";
import { authApi } from "@/lib/api";

/**
 * Токен здесь намеренно не хранится.
 *
 * Access и refresh лежат в httpOnly-куках, которые ставит серверный прокси,
 * а заголовок Authorization он подставляет сам. Браузерный JavaScript токенов
 * не видит, поэтому и класть их в состояние незачем — при XSS утекло бы
 * содержимое localStorage вместе с ними.
 *
 * В сохраняемом состоянии остаются только данные пользователя: они нужны для
 * мгновенной отрисовки интерфейса до ответа /auth/profile.
 */
interface AuthState {
  user: AuthUser | null;
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
      isLoading: false,

      login: async (username: string, password: string) => {
        set({ isLoading: true });
        try {
          // Токены в ответе не приходят: прокси забирает их в httpOnly-куки
          // и вырезает из тела, оставляя только пользователя.
          const { data } = await authApi.login(username, password);
          setStoredUser(data.user);
          set({ user: data.user, isLoading: false });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: () => {
        // Сервер отзывает refresh-токены учётной записи, прокси чистит куки.
        // Ошибку глушим намеренно: локальный выход должен произойти в любом случае.
        authApi.logout().catch(() => {});
        clearStoredUser();
        set({ user: null });
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
    { name: "auth-storage", partialize: (s) => ({ user: s.user }) }
  )
);
