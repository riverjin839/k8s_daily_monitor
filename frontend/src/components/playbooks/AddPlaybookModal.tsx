import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Playbook } from '@/types';

interface AddPlaybookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description: string;
    playbookPath: string;
    inventoryPath: string;
    tags: string;
    clusterId: string;
  }) => void;
  clusters: { id: string; name: string }[];
  defaultClusterId?: string;
  initialData?: Playbook | null;
}

export function AddPlaybookModal({
  isOpen,
  onClose,
  onSubmit,
  clusters,
  defaultClusterId,
  initialData,
}: AddPlaybookModalProps) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [playbookPath, setPlaybookPath] = useState(initialData?.playbookPath ?? '');
  const [inventoryPath, setInventoryPath] = useState(initialData?.inventoryPath ?? '');
  const [tags, setTags] = useState(initialData?.tags ?? '');
  const [clusterId, setClusterId] = useState(initialData?.clusterId ?? defaultClusterId ?? clusters[0]?.id ?? '');

  useEffect(() => {
    setName(initialData?.name ?? '');
    setDescription(initialData?.description ?? '');
    setPlaybookPath(initialData?.playbookPath ?? '');
    setInventoryPath(initialData?.inventoryPath ?? '');
    setTags(initialData?.tags ?? '');
    setClusterId(initialData?.clusterId ?? defaultClusterId ?? clusters[0]?.id ?? '');
  }, [initialData, defaultClusterId, clusters]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !playbookPath.trim() || !clusterId) return;
    onSubmit({ name, description, playbookPath, inventoryPath, tags, clusterId });
    // reset
    setName('');
    setDescription('');
    setPlaybookPath('');
    setInventoryPath('');
    setTags('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{initialData ? 'Edit Playbook' : 'Register Playbook'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cluster */}
          <div>
            <label className="block text-sm font-medium mb-1">Cluster</label>
            <select
              value={clusterId}
              onChange={(e) => setClusterId(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
            >
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Check NTP Sync"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
            />
          </div>

          {/* Playbook Path */}
          <div>
            <label className="block text-sm font-medium mb-1">Playbook Path</label>
            <input
              type="text"
              value={playbookPath}
              onChange={(e) => setPlaybookPath(e.target.value)}
              placeholder="/home/ansible/playbooks/check_ntp.yml"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Path on the execution host (master#1)
            </p>
          </div>

          {/* Inventory Path */}
          <div>
            <label className="block text-sm font-medium mb-1">Inventory Path (optional)</label>
            <input
              type="text"
              value={inventoryPath}
              onChange={(e) => setInventoryPath(e.target.value)}
              placeholder="/etc/ansible/inventory/hosts.yml"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium mb-1">Tags (optional)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. check,validate"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
            >
              {initialData ? 'Save' : 'Register'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
