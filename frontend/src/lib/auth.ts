import Cookies from "js-cookie";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
  department?: string;
}

export function getToken(): string | undefined {
  return Cookies.get("access_token");
}

export function setToken(token: string) {
  Cookies.set("access_token", token, { expires: 1, sameSite: "strict" });
}

export function getRefreshToken(): string | undefined {
  return Cookies.get("refresh_token");
}

export function setRefreshToken(token: string) {
  // 7 дней — совпадает с REFRESH_EXPIRES_IN на бэкенде
  Cookies.set("refresh_token", token, { expires: 7, sameSite: "strict" });
}

export function removeToken() {
  Cookies.remove("access_token");
  Cookies.remove("refresh_token");
  Cookies.remove("user_data");
}

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
  Cookies.set("user_data", JSON.stringify(user), { expires: 1 });
}

export function isAuthenticated(): boolean {
  return !!getToken();
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
