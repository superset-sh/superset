import { useNotificationSettings, useUpdateNotificationSettings } from '../hooks';
import { Switch } from '@superbuilder/feature-ui/shadcn/switch';
import { Label } from '@superbuilder/feature-ui/shadcn/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_LABELS: Record<string, string> = {
  comment: '댓글 알림',
  like: '좋아요 알림',
  follow: '팔로우 알림',
  mention: '멘션 알림',
  system: '시스템 알림',
  announcement: '공지사항',
};

const TYPE_DESCRIPTIONS: Record<string, string> = {
  comment: '내 게시물에 댓글이 달리면 알림을 받습니다',
  like: '내 게시물에 좋아요가 달리면 알림을 받습니다',
  follow: '누군가 나를 팔로우하면 알림을 받습니다',
  mention: '게시물이나 댓글에서 멘션되면 알림을 받습니다',
  system: '시스템 관련 알림을 받습니다',
  announcement: '서비스 공지사항을 받습니다',
};

/**
 * 알림 설정 UI
 */
export function NotificationSettings() {
  const { data: settings, isLoading } = useNotificationSettings();
  const updateSettings = useUpdateNotificationSettings();

  const handleToggle = (type: string, enabled: boolean) => {
    updateSettings.mutate(
      { type: type as any, enabled, channels: ['inapp'] },
      {
        onSuccess: () => {
          toast.success('알림 설정이 저장되었습니다');
        },
        onError: () => {
          toast.error('설정 저장에 실패했습니다');
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {settings?.map((setting: { type: string; enabled: boolean }) => (
        <div key={setting.type} className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor={`setting-${setting.type}`} className="text-sm font-medium">
              {TYPE_LABELS[setting.type] || setting.type}
            </Label>
            <p className="text-xs text-muted-foreground">
              {TYPE_DESCRIPTIONS[setting.type] || ''}
            </p>
          </div>
          <Switch
            id={`setting-${setting.type}`}
            checked={setting.enabled}
            onCheckedChange={(checked) => handleToggle(setting.type, checked)}
            disabled={updateSettings.isPending}
          />
        </div>
      ))}
    </div>
  );
}
