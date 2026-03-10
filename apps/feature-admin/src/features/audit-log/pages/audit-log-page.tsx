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
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { Input } from '@superbuilder/feature-ui/shadcn/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@superbuilder/feature-ui/shadcn/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@superbuilder/feature-ui/shadcn/sheet';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';
import { RotateCcw } from 'lucide-react';
import { useAuditLogs, useAuditLog } from '../hooks';

export function AuditLogPage() {
  // 필터 상태
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  // 상세 Sheet 상태
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const { data, isLoading } = useAuditLogs({
    page,
    limit: 20,
    action: action || undefined,
    resourceType: resourceType || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const { data: selectedLog, isLoading: isDetailLoading } = useAuditLog(selectedLogId);

  const handleResetFilters = () => {
    setAction('');
    setResourceType('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const hasActiveFilters = action || resourceType || startDate || endDate;

  return (
    <div className="container mx-auto py-8">
      <PageHeader
        title="감사 로그"
        description="관리자 액션 기록을 조회합니다"
      />

      {/* 필터 영역 */}
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">액션</label>
          <Select
            value={action || 'all'}
            onValueChange={(v: string | null) => {
              setAction(v === 'all' || !v ? '' : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {ACTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">리소스 타입</label>
          <Input
            value={resourceType}
            onChange={(e) => {
              setResourceType(e.target.value);
              setPage(1);
            }}
            placeholder="예: blog_post"
            className="w-40"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">시작일</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="w-40"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">종료일</label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="w-40"
          />
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleResetFilters}>
            <RotateCcw className="size-3.5 mr-1" />
            초기화
          </Button>
        )}
      </div>

      {/* 테이블 */}
      <div className="mt-6">
        {isLoading ? (
          <LoadingSkeleton />
        ) : data && data.data.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시간</TableHead>
                  <TableHead>액션</TableHead>
                  <TableHead>리소스</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead>사용자</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((log) => (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedLogId(log.id)}
                  >
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('ko-KR')}
                    </TableCell>
                    <TableCell>
                      <ActionBadge action={log.action} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-medium">{log.resourceType}</span>
                      {log.resourceId && (
                        <span className="text-muted-foreground ml-1">
                          #{log.resourceId.slice(0, 8)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm max-w-xs truncate">
                      {log.description}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {log.userId.slice(0, 8)}...
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* 페이지네이션 */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  {data.page} / {data.totalPages} 페이지 (총 {data.total}건)
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    이전
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    다음
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            {hasActiveFilters
              ? '필터 조건에 맞는 로그가 없습니다.'
              : '감사 로그가 없습니다.'}
          </div>
        )}
      </div>

      {/* 상세 Sheet */}
      <Sheet
        open={!!selectedLogId}
        onOpenChange={(open) => {
          if (!open) setSelectedLogId(null);
        }}
      >
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>감사 로그 상세</SheetTitle>
          </SheetHeader>

          <div className="p-4 space-y-6">
            {isDetailLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : selectedLog ? (
              <>
                {/* 기본 정보 */}
                <DetailSection title="기본 정보">
                  <DetailRow label="액션">
                    <ActionBadge action={selectedLog.action} />
                  </DetailRow>
                  <DetailRow label="설명">{selectedLog.description}</DetailRow>
                  <DetailRow label="시간">
                    {new Date(selectedLog.createdAt).toLocaleString('ko-KR')}
                  </DetailRow>
                  <DetailRow label="사용자 ID">
                    <span className="font-mono text-sm">{selectedLog.userId}</span>
                  </DetailRow>
                </DetailSection>

                {/* 리소스 정보 */}
                <DetailSection title="리소스 정보">
                  <DetailRow label="타입">{selectedLog.resourceType}</DetailRow>
                  {selectedLog.resourceId && (
                    <DetailRow label="ID">
                      <span className="font-mono text-sm">{selectedLog.resourceId}</span>
                    </DetailRow>
                  )}
                </DetailSection>

                {/* 변경 내역 */}
                {selectedLog.changes && (
                  <DetailSection title="변경 내역">
                    {selectedLog.changes.before && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">Before</p>
                        <pre className="text-sm bg-muted/50 rounded-md px-3 py-2 overflow-x-auto">
                          {JSON.stringify(selectedLog.changes.before, null, 2)}
                        </pre>
                      </div>
                    )}
                    {selectedLog.changes.after && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">After</p>
                        <pre className="text-sm bg-muted/50 rounded-md px-3 py-2 overflow-x-auto">
                          {JSON.stringify(selectedLog.changes.after, null, 2)}
                        </pre>
                      </div>
                    )}
                  </DetailSection>
                )}

                {/* 메타데이터 */}
                {selectedLog.metadata &&
                  Object.keys(selectedLog.metadata).length > 0 && (
                    <DetailSection title="메타데이터">
                      <pre className="text-sm bg-muted/50 rounded-md px-3 py-2 overflow-x-auto">
                        {JSON.stringify(selectedLog.metadata, null, 2)}
                      </pre>
                    </DetailSection>
                  )}
              </>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                로그를 찾을 수 없습니다.
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

const ACTION_OPTIONS = [
  { value: 'create', label: '생성' },
  { value: 'update', label: '수정' },
  { value: 'delete', label: '삭제' },
  { value: 'assign', label: '할당' },
  { value: 'adjust', label: '조정' },
  { value: 'sync', label: '동기화' },
  { value: 'config_change', label: '설정 변경' },
] as const;

const ACTION_BADGE_MAP: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  create: { label: '생성', variant: 'default' },
  update: { label: '수정', variant: 'secondary' },
  delete: { label: '삭제', variant: 'destructive' },
  assign: { label: '할당', variant: 'outline' },
  adjust: { label: '조정', variant: 'outline' },
  sync: { label: '동기화', variant: 'outline' },
  config_change: { label: '설정 변경', variant: 'outline' },
};

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface ActionBadgeProps {
  action: string;
}

function ActionBadge({ action }: ActionBadgeProps) {
  const config = ACTION_BADGE_MAP[action] ?? { label: action, variant: 'outline' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

interface DetailSectionProps {
  title: string;
  children: React.ReactNode;
}

function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-medium">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  children: React.ReactNode;
}

function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-sm text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
