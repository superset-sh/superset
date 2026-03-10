import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@superbuilder/feature-ui/shadcn/card';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { RefreshCw } from 'lucide-react';
import { EmailLogsTable } from '../../pages/email-logs-table';
import { EmailFilters } from '../../pages/email-filters';
import { useEmailLogs } from '../../hooks/use-email-logs';
import type { EmailStatus, EmailTemplateType } from '../../types';

/**
 * Admin Email Logs Page
 *
 * 관리자 이메일 로그 조회 페이지
 */
export function EmailLogsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<EmailStatus | undefined>();
  const [templateType, setTemplateType] = useState<EmailTemplateType | undefined>();
  const [search, setSearch] = useState('');

  const { data: logs, isLoading, refetch } = useEmailLogs({
    page,
    limit: 20,
    status,
    templateType,
    search: search || undefined,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">이메일 로그</h1>
        <p className="text-muted-foreground">발송된 이메일 이력 및 상태 조회</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>이메일 발송 이력</CardTitle>
              <CardDescription>모든 이메일 발송 로그를 조회하고 관리할 수 있습니다</CardDescription>
            </div>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              새로고침
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 필터 */}
          <EmailFilters
            status={status}
            templateType={templateType}
            search={search}
            onStatusChange={setStatus}
            onTemplateTypeChange={setTemplateType}
            onSearchChange={setSearch}
          />

          {/* 테이블 */}
          <EmailLogsTable logs={logs || []} isLoading={isLoading} />

          {/* 페이지네이션 */}
          {logs && logs.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                총 {logs.length}개 (페이지 {page})
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  이전
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={logs.length < 20}
                >
                  다음
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
