/**
 * Route guard. Renders children when a valid session exists; otherwise shows
 * the LoginPage. When the session is flagged `mustChangePassword`, forces the
 * password change form regardless of the requested route — admin reset and
 * the bootstrap admin account both rely on this.
 */
import { type ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { LoginPage } from '@/pages/LoginPage';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';

export function AuthGate({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  if (!token || !user) return <LoginPage />;
  if (user.mustChangePassword) return <ChangePasswordPage forced />;
  return <>{children}</>;
}
