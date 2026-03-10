import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@superbuilder/feature-ui/shadcn/dialog';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { RefreshCw, X } from 'lucide-react';
import { EmailStatusBadge } from '../components/email-status-badge';
import { EmailTemplateBadge } from '../components/email-template-badge';
import { useEmailLog } from '../hooks/use-email-log';
import { useResendEmail } from '../hooks/use-resend-email';

interface EmailLogDetailModalProps {
  logId?: string;
  onClose: () => void;
}

/**
 * 이메일 로그 상세 모달
 */
export function EmailLogDetailModal({ logId, onClose }: EmailLogDetailModalProps) {
  const { data: log, isLoading } = useEmailLog(logId);
  const resendEmail = useResendEmail();

  const handleResend = async () => {
    if (!logId) return;

    if (confirm('이 이메일을 재발송하시겠습니까?')) {
      try {
        await resendEmail.mutateAsync({ logId });
        alert('이메일이 재발송되었습니다.');
        onClose();
      } catch (error) {
        alert('재발송 실패: ' + (error instanceof Error ? error.message : '알 수 없는 오류'));
      }
    }
  };

  return (
    <Dialog open={!!logId} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>이메일 로그 상세</DialogTitle>
          <DialogDescription>이메일 발송 이력 및 상태 정보</DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">로딩 중...</div>
          </div>
        )}

        {log && (
          <div className="space-y-6">
            {/* 기본 정보 */}
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-muted-foreground">수신자</div>
                <div className="mt-1">
                  <div className="font-medium">{log.recipientEmail}</div>
                  {log.recipientName && (
                    <div className="text-sm text-muted-foreground">{log.recipientName}</div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground">제목</div>
                <div className="mt-1">{log.subject}</div>
              </div>

              <div className="flex gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">템플릿</div>
                  <div className="mt-1">
                    <EmailTemplateBadge templateType={log.templateType} />
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-muted-foreground">상태</div>
                  <div className="mt-1">
                    <EmailStatusBadge status={log.status} />
                  </div>
                </div>
              </div>
            </div>

            {/* 시간 정보 */}
            <div className="space-y-3 border-t pt-4">
              <h4 className="font-medium">시간 정보</h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">생성 시각</div>
                  <div className="mt-1 text-sm">
                    {format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss', { locale: ko })}
                  </div>
                </div>

                {log.sentAt && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">발송 시각</div>
                    <div className="mt-1 text-sm">
                      {format(new Date(log.sentAt), 'yyyy-MM-dd HH:mm:ss', { locale: ko })}
                    </div>
                  </div>
                )}

                {log.deliveredAt && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">배달 시각</div>
                    <div className="mt-1 text-sm">
                      {format(new Date(log.deliveredAt), 'yyyy-MM-dd HH:mm:ss', { locale: ko })}
                    </div>
                  </div>
                )}

                {log.openedAt && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">열람 시각</div>
                    <div className="mt-1 text-sm">
                      {format(new Date(log.openedAt), 'yyyy-MM-dd HH:mm:ss', { locale: ko })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 발송 정보 */}
            <div className="space-y-3 border-t pt-4">
              <h4 className="font-medium">발송 정보</h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">재시도 횟수</div>
                  <div className="mt-1 text-sm">{log.retryCount}회</div>
                </div>

                {log.providerMessageId && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Provider Message ID</div>
                    <div className="mt-1 text-sm font-mono text-xs break-all">
                      {log.providerMessageId}
                    </div>
                  </div>
                )}
              </div>

              {log.failureReason && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">실패 원인</div>
                  <div className="mt-1 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {log.failureReason}
                  </div>
                </div>
              )}
            </div>

            {/* 메타데이터 */}
            {Boolean(log.metadata) && (
              <div className="space-y-3 border-t pt-4">
                <h4 className="font-medium">메타데이터</h4>
                <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </div>
            )}

            {/* 작업 버튼 */}
            <div className="flex justify-end gap-2 border-t pt-4">
              {(log.status === 'failed' || log.status === 'bounced') && (
                <Button
                  onClick={handleResend}
                  disabled={resendEmail.isPending}
                  variant="default"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  재발송
                </Button>
              )}
              <Button onClick={onClose} variant="outline">
                <X className="mr-2 h-4 w-4" />
                닫기
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
