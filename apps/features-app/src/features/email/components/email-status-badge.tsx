import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import type { EmailStatus } from '../types';
import { EMAIL_STATUS_COLORS, EMAIL_STATUS_LABELS } from '../types';

interface EmailStatusBadgeProps {
  status: EmailStatus;
}

/**
 * 이메일 상태 배지
 */
export function EmailStatusBadge({ status }: EmailStatusBadgeProps) {
  const color = EMAIL_STATUS_COLORS[status];
  const label = EMAIL_STATUS_LABELS[status];

  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    gray: 'secondary',
    blue: 'default',
    green: 'default',
    red: 'destructive',
    orange: 'secondary',
    purple: 'default',
  };

  return (
    <Badge variant={variantMap[color] || 'default'} className="capitalize">
      {label}
    </Badge>
  );
}
