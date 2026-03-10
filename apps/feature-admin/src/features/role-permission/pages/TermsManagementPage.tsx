import { useState } from 'react';
import { Plus, Pencil, Ban, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Label } from '@superbuilder/feature-ui/shadcn/label';
import { Checkbox } from '@superbuilder/feature-ui/shadcn/checkbox';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';
import { PageHeader } from '@superbuilder/feature-ui/components/page-header';
import {
  useAdminTerms,
  useCreateTerm,
  useUpdateTerm,
  useDeleteTerm,
} from '../hooks';

export function TermsManagementPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<EditingTerm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formIsRequired, setFormIsRequired] = useState(true);
  const [formSortOrder, setFormSortOrder] = useState(0);

  const { data: terms, isLoading, isError, refetch } = useAdminTerms();
  const createMutation = useCreateTerm();
  const updateMutation = useUpdateTerm();
  const deleteMutation = useDeleteTerm();

  const resetForm = () => {
    setFormName('');
    setFormUrl('');
    setFormIsRequired(true);
    setFormSortOrder(0);
    setEditingTerm(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (term: EditingTerm) => {
    setEditingTerm(term);
    setFormName(term.name);
    setFormUrl(term.url);
    setFormIsRequired(term.isRequired);
    setFormSortOrder(term.sortOrder);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      if (editingTerm) {
        await updateMutation.mutateAsync({
          id: editingTerm.id,
          data: {
            name: formName,
            url: formUrl,
            isRequired: formIsRequired,
            sortOrder: formSortOrder,
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: formName,
          url: formUrl,
          isRequired: formIsRequired,
          sortOrder: formSortOrder,
        });
      }
      setDialogOpen(false);
      resetForm();
    } catch {
      // 에러 토스트는 hook에서 처리됨
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.id });
      setDeleteTarget(null);
    } catch {
      // 에러 토스트는 hook에서 처리됨
    }
  };

  const isFormValid = formName.trim().length > 0 && formUrl.trim().length > 0;
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="약관 관리"
          description="가입 시 표시되는 약관을 관리합니다"
        />
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" />
          약관 추가
        </Button>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : !terms || terms.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>약관 이름</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>필수</TableHead>
                <TableHead>순서</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {terms.map((term) => (
                <TableRow key={term.id}>
                  <TableCell className="font-medium">{term.name}</TableCell>
                  <TableCell>
                    <a
                      href={term.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      링크
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>
                  <TableCell>
                    {term.isRequired ? (
                      <Badge variant="default">필수</Badge>
                    ) : (
                      <Badge variant="outline">선택</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{term.sortOrder}</TableCell>
                  <TableCell>
                    {term.isActive ? (
                      <Badge variant="secondary">활성</Badge>
                    ) : (
                      <Badge variant="outline">비활성</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(term)}
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        수정
                      </Button>
                      {term.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget({ id: term.id, name: term.name })}
                        >
                          <Ban className="mr-1 h-3 w-3" />
                          비활성화
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 추가/수정 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTerm ? '약관 수정' : '약관 추가'}</DialogTitle>
            <DialogDescription>
              {editingTerm ? '약관 정보를 수정합니다.' : '새로운 약관을 등록합니다.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="term-name">약관 이름</Label>
              <Input
                id="term-name"
                placeholder="예: 이용약관"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-url">약관 URL</Label>
              <Input
                id="term-url"
                placeholder="https://example.com/terms"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-sort-order">정렬 순서</Label>
              <Input
                id="term-sort-order"
                type="number"
                min={0}
                value={formSortOrder}
                onChange={(e) => setFormSortOrder(Number(e.target.value))}
              />
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="term-is-required"
                checked={formIsRequired}
                onCheckedChange={(checked) => setFormIsRequired(checked === true)}
              />
              <Label htmlFor="term-is-required">필수 약관</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              취소
            </Button>
            <Button onClick={handleSubmit} disabled={!isFormValid || isSubmitting}>
              {isSubmitting ? '저장 중...' : editingTerm ? '수정' : '등록'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 비활성화 확인 AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>약관을 비활성화하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; 약관을 비활성화합니다. 비활성화된 약관은 가입 화면에 표시되지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {deleteMutation.isPending ? '처리 중...' : '비활성화'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function LoadingSkeleton() {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>약관 이름</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>필수</TableHead>
            <TableHead>순서</TableHead>
            <TableHead>상태</TableHead>
            <TableHead className="text-right">액션</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 3 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              <TableCell><Skeleton className="h-5 w-12" /></TableCell>
              <TableCell><Skeleton className="h-4 w-8" /></TableCell>
              <TableCell><Skeleton className="h-5 w-12" /></TableCell>
              <TableCell className="text-right"><Skeleton className="ml-auto h-8 w-24" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <p className="text-muted-foreground">약관 목록을 불러오는 데 실패했습니다.</p>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        다시 시도
      </Button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16">
      <p className="text-muted-foreground">등록된 약관이 없습니다.</p>
      <p className="text-sm text-muted-foreground/70">상단의 &quot;약관 추가&quot; 버튼으로 약관을 등록해보세요.</p>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface EditingTerm {
  id: string;
  name: string;
  url: string;
  isRequired: boolean;
  sortOrder: number;
}
