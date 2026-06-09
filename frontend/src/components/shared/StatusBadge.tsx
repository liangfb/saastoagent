import { Badge } from '@/components/ui/badge';

const statusVariants: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  ready: 'bg-green-100 text-green-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  parsed: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  generating: 'bg-yellow-100 text-yellow-800',
  parsing: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
  stopped: 'bg-gray-100 text-gray-800',
  closed: 'bg-gray-100 text-gray-800',
};

export function StatusBadge({ status }: { status: string }) {
  const variant = statusVariants[status] || 'bg-gray-100 text-gray-800';
  return (
    <Badge variant="outline" className={variant}>
      {status}
    </Badge>
  );
}
