import { useState, useEffect } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Search,
} from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Switch } from "@superbuilder/feature-ui/shadcn/switch";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@superbuilder/feature-ui/shadcn/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@superbuilder/feature-ui/shadcn/alert-dialog";
import { toast } from "sonner";
import {
  useAdminCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useReorderCategories,
  useToggleCategoryActive,
} from "../hooks";

interface Props {}

export function CategoryManagement({}: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useAdminCategories({
    page,
    limit: 20,
    search: search || undefined,
  });
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const reorderCategories = useReorderCategories();
  const toggleActive = useToggleCategoryActive();

  // 생성/편집 다이얼로그
  const [form, setForm] = useState<CategoryFormData>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // 이름 변경 시 slug 자동 생성
  useEffect(() => {
    if (!slugManuallyEdited && form.name) {
      setForm((prev) => ({ ...prev, slug: generateSlug(prev.name) }));
    }
  }, [form.name, slugManuallyEdited]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setSlugManuallyEdited(false);
  };

  const openCreate = () => {
    resetForm();
    // 다음 sortOrder를 자동 설정
    const maxOrder =
      data?.data?.reduce(
        (max, cat) => Math.max(max, cat.sortOrder ?? 0),
        0,
      ) ?? 0;
    setForm({ ...EMPTY_FORM, sortOrder: maxOrder + 1 });
    setIsDialogOpen(true);
  };

  const openEdit = (category: CategoryRow) => {
    setForm({
      name: category.name,
      slug: category.slug ?? "",
      description: category.description ?? "",
      icon: category.icon ?? "",
      sortOrder: category.sortOrder ?? 0,
    });
    setEditingId(category.id);
    setSlugManuallyEdited(true);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("카테고리명을 입력해주세요.");
      return;
    }
    if (!form.slug.trim()) {
      toast.error("Slug를 입력해주세요.");
      return;
    }

    const payload = {
      name: form.name,
      slug: form.slug,
      description: form.description || undefined,
      icon: form.icon || undefined,
      sortOrder: form.sortOrder,
    };

    if (editingId) {
      updateCategory.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            toast.success("카테고리가 수정되었습니다.");
            setIsDialogOpen(false);
            resetForm();
          },
          onError: (error) =>
            toast.error(error.message || "수정에 실패했습니다."),
        },
      );
    } else {
      createCategory.mutate(payload, {
        onSuccess: () => {
          toast.success("카테고리가 생성되었습니다.");
          setIsDialogOpen(false);
          resetForm();
        },
        onError: (error) =>
          toast.error(error.message || "생성에 실패했습니다."),
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteCategory.mutate(id, {
      onSuccess: () => toast.success("카테고리가 삭제되었습니다."),
      onError: (error) =>
        toast.error(error.message || "삭제에 실패했습니다."),
    });
  };

  const handleToggleActive = (id: string) => {
    toggleActive.mutate(id, {
      onError: (error) =>
        toast.error(error.message || "상태 변경에 실패했습니다."),
    });
  };

  const handleMoveUp = (index: number) => {
    if (!data?.data || index <= 0) return;
    const items = [...data.data];
    const current = items[index];
    const above = items[index - 1];
    if (!current || !above) return;

    reorderCategories.mutate(
      [
        { id: current.id, sortOrder: above.sortOrder ?? index - 1 },
        { id: above.id, sortOrder: current.sortOrder ?? index },
      ],
      {
        onError: (error) =>
          toast.error(error.message || "순서 변경에 실패했습니다."),
      },
    );
  };

  const handleMoveDown = (index: number) => {
    if (!data?.data || index >= data.data.length - 1) return;
    const items = [...data.data];
    const current = items[index];
    const below = items[index + 1];
    if (!current || !below) return;

    reorderCategories.mutate(
      [
        { id: current.id, sortOrder: below.sortOrder ?? index + 1 },
        { id: below.id, sortOrder: current.sortOrder ?? index },
      ],
      {
        onError: (error) =>
          toast.error(error.message || "순서 변경에 실패했습니다."),
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">카테고리 관리</h1>
          <p className="text-sm text-muted-foreground">
            상담 카테고리를 생성하고 순서 및 활성 상태를 관리합니다.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          카테고리 추가
        </Button>
      </div>

      {/* 검색 */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="카테고리 검색..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>
      </div>

      {/* 테이블 */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : !data?.data?.length ? (
        <div className="py-12 text-center text-muted-foreground">
          {search
            ? "조건에 맞는 카테고리가 없습니다."
            : "카테고리가 없습니다. 새 카테고리를 추가해주세요."}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">순서</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="max-w-[200px]">설명</TableHead>
                <TableHead>아이콘</TableHead>
                <TableHead className="text-center">활성</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((category: CategoryRow, index: number) => (
                <TableRow key={category.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="w-6 text-center text-sm text-muted-foreground">
                        {category.sortOrder ?? index}
                      </span>
                      <div className="flex flex-col">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          disabled={index === 0 || reorderCategories.isPending}
                          onClick={() => handleMoveUp(index)}
                        >
                          <ChevronUp className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          disabled={
                            index === data.data.length - 1 ||
                            reorderCategories.isPending
                          }
                          onClick={() => handleMoveDown(index)}
                        >
                          <ChevronDown className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {category.name}
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted/50 px-1.5 py-0.5 text-sm">
                      {category.slug}
                    </code>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {category.description ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {category.icon ?? "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={category.isActive !== false}
                      onCheckedChange={() => handleToggleActive(category.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(category)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={<Button variant="ghost" size="sm" />}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>카테고리 삭제</AlertDialogTitle>
                            <AlertDialogDescription>
                              &quot;{category.name}&quot;을(를)
                              삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(category.id)}
                            >
                              삭제
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {data.totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={data.totalPages}
              total={data.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {/* 생성/편집 다이얼로그 */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
          setIsDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "카테고리 수정" : "카테고리 추가"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>카테고리명</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="예: 심리 상담"
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={form.slug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setForm((prev) => ({ ...prev, slug: e.target.value }));
                }}
                placeholder="자동 생성됩니다"
              />
              <p className="text-sm text-muted-foreground">
                카테고리명에서 자동 생성됩니다. 직접 수정도 가능합니다.
              </p>
            </div>
            <div className="space-y-2">
              <Label>설명</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="카테고리에 대한 간단한 설명"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>아이콘 (lucide 이름)</Label>
                <Input
                  value={form.icon}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, icon: e.target.value }))
                  }
                  placeholder="예: Heart"
                />
              </div>
              <div className="space-y-2">
                <Label>정렬 순서</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      sortOrder: Number(e.target.value),
                    }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              취소
            </DialogClose>
            <Button
              onClick={handleSubmit}
              disabled={createCategory.isPending || updateCategory.isPending}
            >
              {editingId ? "수정" : "생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (p: number) => void;
}

function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">
        {page} / {totalPages} 페이지 (총 {total}건)
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          이전
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          다음
        </Button>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[가-힣]+/g, (match) => {
      // 한글은 romanization 대신 그대로 유지하되 공백/특수문자 처리
      return match;
    })
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const EMPTY_FORM: CategoryFormData = {
  name: "",
  slug: "",
  description: "",
  icon: "",
  sortOrder: 0,
};

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface CategoryFormData {
  name: string;
  slug: string;
  description: string;
  icon: string;
  sortOrder: number;
}

interface CategoryRow {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  icon?: string | null;
  isActive?: boolean;
  sortOrder?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}
