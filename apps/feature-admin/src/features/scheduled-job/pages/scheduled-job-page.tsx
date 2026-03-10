import { useState } from 'react';
import { PageHeader } from '@superbuilder/feature-ui/components/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@superbuilder/feature-ui/shadcn/table';
import { Switch } from '@superbuilder/feature-ui/shadcn/switch';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@superbuilder/feature-ui/shadcn/sheet';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';
import { Play, History } from 'lucide-react';
import { toast } from 'sonner';
import {
  useScheduledJobs,
  useJobRuns,
  useToggleJob,
  useRunJobNow,
} from '../hooks';

export function ScheduledJobPage() {
  const { data: jobs, isLoading } = useScheduledJobs();
  const toggleJob = useToggleJob();
  const runJobNow = useRunJobNow();

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobName, setSelectedJobName] = useState<string>('');
  const [historyPage, setHistoryPage] = useState(1);

  const { data: runsData, isLoading: isRunsLoading } = useJobRuns(
    selectedJobId,
    historyPage,
  );

  const handleToggle = (jobId: string) => {
    toggleJob.mutate(
      { jobId },
      {
        onSuccess: (updated) => {
          toast.success(
            updated.isActive ? '잡이 활성화되었습니다.' : '잡이 비활성화되었습니다.',
          );
        },
        onError: (error) => {
          toast.error(error.message || '상태 변경에 실패했습니다.');
        },
      },
    );
  };

  const handleRunNow = (jobKey: string, displayName: string) => {
    runJobNow.mutate(
      { jobKey },
      {
        onSuccess: () => {
          toast.success(`"${displayName}" 수동 실행이 시작되었습니다.`);
        },
        onError: (error) => {
          toast.error(error.message || '수동 실행에 실패했습니다.');
        },
      },
    );
  };

  const handleOpenHistory = (jobId: string, displayName: string) => {
    setSelectedJobId(jobId);
    setSelectedJobName(displayName);
    setHistoryPage(1);
  };

  return (
    <div className="container mx-auto py-8">
      <PageHeader
        title="스케줄러"
        description="예약 작업을 관리합니다"
      />

      <div className="mt-8">
        {isLoading ? (
          <LoadingSkeleton />
        ) : jobs && jobs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>Cron</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>마지막 실행</TableHead>
                <TableHead>다음 실행</TableHead>
                <TableHead className="text-right">동작</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium text-foreground hover:text-primary transition-colors"
                      onClick={() => handleOpenHistory(job.id, job.displayName)}
                    >
                      {job.displayName}
                    </button>
                    {job.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {job.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-sm bg-muted px-1.5 py-0.5 rounded-md">
                      {job.cronExpression}
                    </code>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={job.isActive}
                        onCheckedChange={() => handleToggle(job.id)}
                        size="sm"
                      />
                      <span className="text-sm text-muted-foreground">
                        {job.isActive ? '활성' : '비활성'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {job.lastRunAt
                        ? new Date(job.lastRunAt).toLocaleString('ko-KR')
                        : '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {job.nextRunAt
                        ? new Date(job.nextRunAt).toLocaleString('ko-KR')
                        : '-'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRunNow(job.jobKey, job.displayName)}
                        disabled={runJobNow.isPending}
                      >
                        <Play className="size-3.5 mr-1" />
                        실행
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenHistory(job.id, job.displayName)}
                      >
                        <History className="size-3.5 mr-1" />
                        이력
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            등록된 예약 작업이 없습니다.
          </div>
        )}
      </div>

      {/* 실행 이력 Sheet */}
      <Sheet
        open={!!selectedJobId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedJobId(null);
            setSelectedJobName('');
          }
        }}
      >
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{selectedJobName} - 실행 이력</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4">
            {isRunsLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : runsData && runsData.data.length > 0 ? (
              <div className="space-y-3">
                {runsData.data.map((run) => (
                  <RunCard key={run.id} run={run} />
                ))}

                {/* 페이지네이션 */}
                {runsData.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-sm text-muted-foreground">
                      {runsData.page} / {runsData.totalPages} 페이지
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={historyPage <= 1}
                        onClick={() => setHistoryPage((p) => p - 1)}
                      >
                        이전
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={historyPage >= runsData.totalPages}
                        onClick={() => setHistoryPage((p) => p + 1)}
                      >
                        다음
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                실행 이력이 없습니다.
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive'; className?: string }> = {
  running: { label: '실행 중', variant: 'default' },
  success: { label: '성공', variant: 'secondary', className: 'bg-green-600/10 text-green-600 border-green-600/20' },
  failed: { label: '실패', variant: 'destructive' },
};

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface RunCardProps {
  run: {
    id: string;
    status: string;
    startedAt: string | Date;
    completedAt: string | Date | null;
    durationMs: number | null;
    result: Record<string, unknown> | null;
    errorMessage: string | null;
  };
}

function RunCard({ run }: RunCardProps) {
  const config = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.running!;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Badge variant={config!.variant} className={config!.className}>
          {config!.label}
        </Badge>
        {run.durationMs != null && (
          <span className="text-sm text-muted-foreground">
            {formatDuration(run.durationMs)}
          </span>
        )}
      </div>

      <div className="space-y-1 text-sm">
        <p className="text-muted-foreground">
          시작: {new Date(run.startedAt).toLocaleString('ko-KR')}
        </p>
        {run.completedAt && (
          <p className="text-muted-foreground">
            완료: {new Date(run.completedAt).toLocaleString('ko-KR')}
          </p>
        )}
      </div>

      {run.errorMessage && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-2 py-1">
          {run.errorMessage}
        </p>
      )}

      {run.result && Object.keys(run.result).length > 0 && (
        <pre className="text-sm text-muted-foreground bg-muted/50 rounded-md px-2 py-1 overflow-x-auto">
          {JSON.stringify(run.result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      {[...Array(3)].map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}초`;
}
