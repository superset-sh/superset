import { useState } from 'react';
import { UserCog, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import type { Role } from '@superbuilder/drizzle';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@superbuilder/feature-ui/shadcn/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@superbuilder/feature-ui/shadcn/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@superbuilder/feature-ui/shadcn/table';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import { Input } from '@superbuilder/feature-ui/shadcn/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@superbuilder/feature-ui/shadcn/select';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@superbuilder/feature-ui/shadcn/avatar';
import { PageHeader } from '@superbuilder/feature-ui/components/page-header';
import { toast } from 'sonner';
import { UserRoleEditor } from '../components';
import {
  useRoles,
  useUserRoles,
  useAssignRolesToUser,
  useAdminUsers,
  useDeactivateUser,
  useReactivateUser,
} from '../hooks';

export function UsersManagementPage() {
  // 페이지네이션 & 검색
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [marketingConsent, setMarketingConsent] = useState<string | undefined>(undefined);

  // 역할 관리 Dialog
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string | null>(null);
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);

  // 비활성화/활성화 확인 Dialog
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string } | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<{ id: string; name: string } | null>(null);

  // 데이터 조회
  const { data, isLoading, isError, refetch } = useAdminUsers({
    page,
    limit,
    search: search || undefined,
    marketingConsent: marketingConsent as 'agreed' | 'not_agreed' | undefined,
  });
  const { data: availableRoles } = useRoles();
  const { data: userRolesData } = useUserRoles(selectedUserId || '', !!selectedUserId);
  const assignRolesMutation = useAssignRolesToUser();
  const deactivateMutation = useDeactivateUser();
  const reactivateMutation = useReactivateUser();

  const users = data?.data ?? [];
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

  const handleManageRoles = (userId: string, userName: string) => {
    setSelectedUserId(userId);
    setSelectedUserName(userName);
    setRoleEditorOpen(true);
  };

  const handleSaveRoles = async (roleIds: string[]) => {
    if (!selectedUserId) return;

    try {
      await assignRolesMutation.mutateAsync({
        userId: selectedUserId,
        roleIds,
      });
      toast.success('사용자 역할이 업데이트되었습니다.');
      setRoleEditorOpen(false);
      setSelectedUserId(null);
      setSelectedUserName(null);
    } catch {
      toast.error('역할 업데이트에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;

    try {
      await deactivateMutation.mutateAsync({ targetId: deactivateTarget.id });
      setDeactivateTarget(null);
    } catch {
      // 에러 토스트는 hook에서 처리됨
    }
  };

  const handleReactivate = async () => {
    if (!reactivateTarget) return;

    try {
      await reactivateMutation.mutateAsync({ targetId: reactivateTarget.id });
      setReactivateTarget(null);
    } catch {
      // 에러 토스트는 hook에서 처리됨
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="사용자 관리"
        description="시스템 사용자 목록 조회 및 역할 관리"
      />

      {/* 검색 */}
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
        <Button variant="outline" onClick={handleSearch}>
          검색
        </Button>
        <Select
          value={marketingConsent ?? "all"}
          onValueChange={(value) => {
            setMarketingConsent(!value || value === "all" ? undefined : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="마케팅 동의" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="agreed">동의</SelectItem>
            <SelectItem value="not_agreed">미동의</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 데이터 상태별 렌더링 */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : users.length === 0 ? (
        <EmptyState hasSearch={!!search} />
      ) : (
        <>
          {/* 테이블 */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>사용자</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>마케팅 동의</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar size="sm">
                          {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                          <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-foreground">{user.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <Badge variant="secondary">활성</Badge>
                      ) : (
                        <Badge variant="outline">비활성</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.marketingConsentAt
                        ? new Date(user.marketingConsentAt).toLocaleDateString('ko-KR')
                        : <Badge variant="outline">미동의</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleManageRoles(user.id, user.name)}
                        >
                          <UserCog className="w-4 h-4 mr-2" />
                          역할 관리
                        </Button>
                        {user.isActive ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeactivateTarget({ id: user.id, name: user.name })}
                          >
                            비활성화
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setReactivateTarget({ id: user.id, name: user.name })}
                          >
                            활성화
                          </Button>
                        )}
                      </div>
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

      {/* 역할 관리 Dialog */}
      <Dialog open={roleEditorOpen} onOpenChange={setRoleEditorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>사용자 역할 관리</DialogTitle>
            <DialogDescription>
              {selectedUserName || '사용자'}의 역할을 설정합니다
            </DialogDescription>
          </DialogHeader>
          {availableRoles && userRolesData && (
            <UserRoleEditor
              availableRoles={availableRoles as unknown as Role[]}
              currentRoleIds={userRolesData.roles.map((r) => r.id)}
              onSave={handleSaveRoles}
              onCancel={() => {
                setRoleEditorOpen(false);
                setSelectedUserId(null);
                setSelectedUserName(null);
              }}
              isLoading={assignRolesMutation.isPending}
              userName={selectedUserName || undefined}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 비활성화 확인 AlertDialog */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>사용자를 비활성화하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deactivateTarget?.name}&quot; 사용자를 비활성화합니다. 비활성화된 사용자는 시스템에 접근할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className="bg-destructive text-destructive-foreground"
            >
              {deactivateMutation.isPending ? '처리 중...' : '비활성화'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 활성화 확인 AlertDialog */}
      <AlertDialog open={!!reactivateTarget} onOpenChange={(open) => !open && setReactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>사용자를 활성화하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{reactivateTarget?.name}&quot; 사용자를 다시 활성화합니다. 활성화된 사용자는 시스템에 접근할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleReactivate}>
              {reactivateMutation.isPending ? '처리 중...' : '활성화'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

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
            <TableHead>상태</TableHead>
            <TableHead>마케팅 동의</TableHead>
            <TableHead className="text-right">액션</TableHead>
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
                <Skeleton className="h-5 w-12" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="h-8 w-24 ml-auto" />
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
      <p className="text-muted-foreground">사용자 목록을 불러오는 데 실패했습니다.</p>
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
        {hasSearch ? '검색 결과가 없습니다.' : '등록된 사용자가 없습니다.'}
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
