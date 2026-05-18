/**
 * Self-service password change.
 *
 * Used in two modes:
 *  - `forced` (no nav out): rendered by AuthGate when `mustChangePassword=true`.
 *    The only way out is to successfully change the password or log out.
 *  - Manual (from the user menu): standalone route `/me/change-password`.
 */
import { useId, useState } from 'react';
import { Loader2, KeyRound, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  forced?: boolean;
}

export function ChangePasswordPage({ forced = false }: Props) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fid = useId();
  const f = (k: string) => `${fid}-${k}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSuccess(null);

    if (newPassword.length < 4) {
      setError('새 비밀번호는 최소 4자 이상이어야 합니다.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('새 비밀번호는 기존 비밀번호와 달라야 합니다.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authApi.changeMyPassword(currentPassword, newPassword);
      // 응답이 어떻든 강제 변경 화면을 빠져나갈 수 있도록 mustChangePassword 를 명시적으로
      // false 로 덮어쓴다 — 백엔드 응답이 누락되거나 캐시 이슈로 true 가 와도 안전.
      setUser({ ...res.data, mustChangePassword: false });
      setSuccess('비밀번호가 변경되었습니다.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (!forced) {
        // Manual mode: go back to the previous page after a brief confirmation.
        setTimeout(() => navigate(-1), 800);
      }
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail
        ?? (err as { message?: string })?.message
        ?? '비밀번호 변경에 실패했습니다.';
      setError(typeof msg === 'string' ? msg : '비밀번호 변경에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 mac-shadow">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-9 h-9 bg-gradient-to-br from-primary to-sky-700 rounded-md flex items-center justify-center text-white">
            <KeyRound className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">비밀번호 변경</h1>
            <p className="text-xs text-muted-foreground">
              {forced
                ? '보안을 위해 최초 로그인 시 비밀번호를 변경해야 합니다.'
                : `${user?.username ?? ''} 계정의 비밀번호를 변경합니다.`}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={f('current')} className="block text-sm font-medium mb-1">현재 비밀번호</label>
            <input
              id={f('current')}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={submitting}
              required
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor={f('new')} className="block text-sm font-medium mb-1">새 비밀번호</label>
            <input
              id={f('new')}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={submitting}
              minLength={4}
              required
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor={f('confirm')} className="block text-sm font-medium mb-1">새 비밀번호 확인</label>
            <input
              id={f('confirm')}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
              minLength={4}
              required
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {success && <p role="status" className="text-sm text-emerald-600">{success}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {submitting ? '변경 중…' : '비밀번호 변경'}
            </button>
            {forced ? (
              <button
                type="button"
                onClick={() => clear()}
                disabled={submitting}
                className="px-3 py-2 text-sm bg-secondary border border-border rounded-xl hover:bg-muted flex items-center gap-1"
                title="로그아웃"
              >
                <LogOut className="w-4 h-4" />
                로그아웃
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate(-1)}
                disabled={submitting}
                className="px-3 py-2 text-sm bg-secondary border border-border rounded-xl hover:bg-muted"
              >
                취소
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
