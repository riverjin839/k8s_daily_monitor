import type { Task } from '@/types';

export type TaskKanbanColumn = 'scheduled' | 'delayed' | 'completed';

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function classifyTask(task: Task): TaskKanbanColumn {
  if (task.completedAt) return 'completed';
  if (new Date(task.scheduledAt) < todayMidnight()) return 'delayed';
  return 'scheduled';
}
