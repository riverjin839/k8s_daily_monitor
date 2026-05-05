import { create } from 'zustand';

// API response interceptor converts snake_case → camelCase, so we model the
// shape the React tree actually receives.
export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  displayName?: string | null;
  isActive: boolean;
  createdAt: string;
}

const TOKEN_KEY = 'k8s:auth:token';
const USER_KEY = 'k8s:auth:user';

function loadToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch { return null; }
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  setUser: (user: AuthUser) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: loadToken(),
  user: loadUser(),
  setSession: (token, user) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch { /* ignore */ }
    set({ token, user });
  },
  setUser: (user) => {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* ignore */ }
    set({ user });
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch { /* ignore */ }
    set({ token: null, user: null });
  },
}));

// Stable accessor used by the axios interceptor (it can't subscribe to React).
export function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}

export function clearAuthSession() {
  useAuthStore.getState().clear();
}
