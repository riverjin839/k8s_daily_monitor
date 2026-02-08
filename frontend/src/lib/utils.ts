import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Status } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getStatusColor(status: Status): string {
  switch (status) {
    case 'healthy':
      return 'text-status-healthy';
    case 'warning':
      return 'text-status-warning';
    case 'critical':
      return 'text-status-critical';
    default:
      return 'text-muted-foreground';
  }
}

export function getStatusBgColor(status: Status): string {
  switch (status) {
    case 'healthy':
      return 'bg-status-healthy/10';
    case 'warning':
      return 'bg-status-warning/10';
    case 'critical':
      return 'bg-status-critical/10';
    default:
      return 'bg-muted';
  }
}

export function getStatusIcon(status: Status): string {
  switch (status) {
    case 'healthy':
      return '🟢';
    case 'warning':
      return '🟠';
    case 'critical':
      return '🔴';
    default:
      return '⚪';
  }
}

// Backend는 datetime.utcnow() (UTC)로 저장하지만 timezone suffix 없이 반환
// JavaScript new Date()는 suffix 없으면 로컬 시간으로 해석 → UTC 'Z' 붙여서 보정
function parseUTC(dateString: string): Date {
  if (!dateString) return new Date();
  // 이미 timezone info가 있으면 그대로 사용
  if (dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString)) {
    return new Date(dateString);
  }
  // timezone 없으면 UTC로 해석
  return new Date(dateString + 'Z');
}

export function formatDateTime(dateString: string): string {
  const date = parseUTC(dateString);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatRelativeTime(dateString: string): string {
  const date = parseUTC(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return `${diffSec}초 전`;
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${diffDay}일 전`;
}
