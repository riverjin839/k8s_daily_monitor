/**
 * Route guard. Renders children when a valid session exists; otherwise shows
 * the LoginPage. Re-runs on token changes (login / logout / 401-driven clear).
 */
import { type ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { LoginPage } from '@/pages/LoginPage';

export function AuthGate({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  if (!token || !user) return <LoginPage />;
  return <>{children}</>;
}
