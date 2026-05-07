export function formatBytes(n: number): string {
  if (!n || n <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function pickPrimaryName(names: string[]): string {
  if (names.length === 0) return '(unknown)';
  const tagged = names.find((n) => !n.includes('@sha256:'));
  return tagged || names[0];
}
