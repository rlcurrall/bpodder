import { createContext, type ComponentChildren } from "preact";
import { useState, useContext, useCallback } from "preact/hooks";

import * as api from "./api/auth";

interface AuthContextValue {
  username: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ComponentChildren }) {
  const [username, setUsername] = useState<string | null>(localStorage.getItem("username"));

  const login = useCallback(async (user: string, password: string): Promise<boolean> => {
    const ok = await api.login(user, password);
    if (ok) {
      localStorage.setItem("username", user);
      setUsername(user);
    }
    return ok;
  }, []);

  const logout = useCallback(async () => {
    if (username) {
      await api.logout(username);
    }
    localStorage.removeItem("username");
    setUsername(null);
  }, [username]);

  return (
    <AuthContext.Provider
      value={{
        username,
        isAuthenticated: username !== null,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
