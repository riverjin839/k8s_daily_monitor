import { Pencil } from 'lucide-react';
import { NodeInfo } from '@/hooks/useNodeLabels';

interface Props {
  nodes: NodeInfo[];
  onEdit: (node: NodeInfo) => void;
}

export function NodeLabelsTable({ nodes, onEdit }: Props) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/20">
          <tr>
            <th className="text-left p-3">Node</th>
            <th className="text-left p-3">Role</th>
            <th className="text-left p-3">Status</th>
            <th className="text-left p-3">Labels</th>
            <th className="text-left p-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.name} className="border-t border-border align-top">
              <td className="p-3 font-mono">{node.name}</td>
              <td className="p-3">{node.role}</td>
              <td className="p-3">{node.status}</td>
              <td className="p-3">
                <div className="flex flex-wrap gap-1 max-w-3xl">
                  {Object.entries(node.labels).slice(0, 12).map(([k, v]) => (
                    <span key={k} className="px-2 py-0.5 text-xs rounded bg-secondary border border-border font-mono">{k}={v}</span>
                  ))}
                </div>
              </td>
              <td className="p-3">
                <button onClick={() => onEdit(node)} className="px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 inline-flex items-center gap-1">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
