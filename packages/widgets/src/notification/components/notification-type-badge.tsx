import { Badge } from '@superbuilder/feature-ui/shadcn/badge';

interface NotificationTypeBadgeProps {
  type: string;
}

const TYPE_LABELS: Record<string, string> = {
  comment: '댓글',
  like: '좋아요',
  follow: '팔로우',
  mention: '멘션',
  system: '시스템',
  announcement: '공지',
};

const TYPE_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  comment: 'default',
  like: 'secondary',
  follow: 'default',
  mention: 'default',
  system: 'secondary',
  announcement: 'destructive',
};

/**
 * 알림 유형 배지
 */
export function NotificationTypeBadge({ type }: NotificationTypeBadgeProps) {
  const label = TYPE_LABELS[type] || type;
  const variant = TYPE_VARIANTS[type] || 'default';

  return (
    <Badge variant={variant} className="capitalize">
      {label}
    </Badge>
  );
}
