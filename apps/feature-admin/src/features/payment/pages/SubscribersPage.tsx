import { useState } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@superbuilder/feature-ui/components/page-header';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { Input } from '@superbuilder/feature-ui/shadcn/input';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@superbuilder/feature-ui/shadcn/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@superbuilder/feature-ui/shadcn/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@superbuilder/feature-ui/shadcn/table';
import { useSubscribers } from '../hooks';

export function SubscribersPage() {
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading, isError, refetch } = useSubscribers({
    page,
    limit,
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const subscribers = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleStatusFilterChange = (value: string | null) => {
    if (value) {
      setStatusFilter(value);
      setPage(1);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="구독자 관리"
        description="플랜 구독자 목록을 조회합니다"
      />

      {/* 검색 + 필터 */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="이름 또는 이메일로 검색..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleSearch}>
          검색
        </Button>
      </div>

      {/* 데이터 상태별 렌더링 */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : subscribers.length === 0 ? (
        <EmptyState hasSearch={!!search || statusFilter !== 'all'} />
      ) : (
        <>
          {/* 테이블 */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>사용자</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>플랜</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>가격</TableHead>
                  <TableHead>구독일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscribers.map((subscriber) => (
                  <TableRow key={subscriber.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar size="sm">
                          {subscriber.avatar && (
                            <AvatarImage src={subscriber.avatar} alt={subscriber.name} />
                          )}
                          <AvatarFallback>{getInitials(subscriber.name)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-foreground">{subscriber.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{subscriber.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{subscriber.planName}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[subscriber.status] ?? 'outline'}>
                        {subscriber.statusFormatted}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      ${subscriber.price.toLocaleString()}/{subscriber.interval}
                    </TableCell>
                    <TableCell className="text-muted-foreground/70">
                      {new Date(subscriber.createdAt).toLocaleDateString('ko-KR')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 페이지네이션 */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              전체 {total}명 중 {(page - 1) * limit + 1}-{Math.min(page * limit, total)}명 표시
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
                이전
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                다음
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const STATUS_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '활성' },
  { value: 'cancelled', label: '취소됨' },
  { value: 'expired', label: '만료됨' },
  { value: 'paused', label: '일시정지' },
  { value: 'on_trial', label: '체험판' },
];

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  cancelled: 'destructive',
  expired: 'secondary',
  paused: 'outline',
  on_trial: 'default',
};

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function LoadingSkeleton() {
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>사용자</TableHead>
            <TableHead>이메일</TableHead>
            <TableHead>플랜</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>가격</TableHead>
            <TableHead>구독일</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-12" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <p className="text-muted-foreground">구독자 목록을 불러오는 데 실패했습니다.</p>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="w-4 h-4 mr-2" />
        다시 시도
      </Button>
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <p className="text-muted-foreground">
        {hasSearch ? '검색 결과가 없습니다.' : '구독자가 없습니다.'}
      </p>
      {hasSearch && (
        <p className="text-sm text-muted-foreground/70">다른 검색어를 시도해보세요.</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
