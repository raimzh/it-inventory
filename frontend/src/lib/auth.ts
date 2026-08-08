import Cookies from "js-cookie";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
  department?: string;
}

/**
 * Токены здесь намеренно отсутствуют.
 *
 * Access и refresh хранятся в httpOnly-куках, которые ставит серверный
 * прокси (src/app/api/[...path]/route.ts). Браузерный JavaScript их не
 * видит, поэтому украсть токен через XSS нельзя, а заголовок Authorization
 * подставляется на сервере.
 *
 * Как следствие, «есть ли сессия» больше нельзя узнать чтением куки —
 * это выясняется запросом профиля (см. dashboard/layout.tsx).
 */

/** Данные пользователя — не учётные данные, поэтому обычная кука допустима. */
export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const data = Cookies.get("user_data");
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser) {
  Cookies.set("user_data", JSON.stringify(user), { expires: 1, sameSite: "strict" });
}

export function clearStoredUser() {
  Cookies.remove("user_data");
}

export function hasRole(user: AuthUser | null, ...roles: string[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

export function canEdit(user: AuthUser | null): boolean {
  return hasRole(user, "admin", "accountant", "inventorizer");
}

export function isAdmin(user: AuthUser | null): boolean {
  return hasRole(user, "admin");
}
