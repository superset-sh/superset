import { useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@superbuilder/feature-ui/shadcn/table';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { RefreshCw, Eye } from 'lucide-react';
import { EmailStatusBadge } from '../components/email-status-badge';
import { EmailTemplateBadge } from '../components/email-template-badge';
import { EmailLogDetailModal } from './email-log-detail-modal';
import { useResendEmail } from '../hooks/use-resend-email';
import type { EmailLog } from '../types';

interface EmailLogsTableProps {
  logs: EmailLog[];
  isLoading?: boolean;
}

/**
 * 이메일 로그 테이블
 */
export function EmailLogsTable({ logs, isLoading }: EmailLogsTableProps) {
  const [selectedLogId, setSelectedLogId] = useState<string | undefined>();
  const resendEmail = useResendEmail();

  const handleResend = async (logId: string) => {
    if (confirm('이 이메일을 재발송하시겠습니까?')) {
      try {
        await resendEmail.mutateAsync({ logId });
        alert('이메일이 재발송되었습니다.');
      } catch (error) {
        alert('재발송 실패: ' + (error instanceof Error ? error.message : '알 수 없는 오류'));
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">이메일 로그가 없습니다.</div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>수신자</TableHead>
              <TableHead>템플릿</TableHead>
              <TableHead>제목</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>발송 시각</TableHead>
              <TableHead>재시도</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>
                  <div className="font-medium">{log.recipientEmail}</div>
                  {log.recipientName && (
                    <div className="text-sm text-muted-foreground">{log.recipientName}</div>
                  )}
                </TableCell>
                <TableCell>
                  <EmailTemplateBadge templateType={log.templateType} />
                </TableCell>
                <TableCell className="max-w-[300px] truncate">{log.subject}</TableCell>
                <TableCell>
                  <EmailStatusBadge status={log.status} />
                </TableCell>
                <TableCell>
                  {log.sentAt ? (
                    <time dateTime={log.sentAt}>
                      {format(new Date(log.sentAt), 'yyyy-MM-dd HH:mm', { locale: ko })}
                    </time>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">{log.retryCount}회</span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedLogId(log.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {(log.status === 'failed' || log.status === 'bounced') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResend(log.id)}
                        disabled={resendEmail.isPending}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 상세 모달 */}
      <EmailLogDetailModal logId={selectedLogId} onClose={() => setSelectedLogId(undefined)} />
    </>
  );
}
