import { useState } from "react";
import { Plus, Search, Pencil, Trash2, Package } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Switch } from "@superbuilder/feature-ui/shadcn/switch";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
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
  useAdminProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useToggleProductStatus,
} from "../hooks";

interface Props {}

export function ProductManagement({}: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormData>({ ...EMPTY_FORM });

  const { data, isLoading } = useAdminProducts({
    page,
    limit: 20,
    search: search || undefined,
  });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const toggleStatus = useToggleProductStatus();

  const products = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEdit = (product: ProductRow) => {
    setForm({
      name: product.name,
      description: product.description ?? "",
      price: product.price ?? 0,
      durationMinutes: product.durationMinutes ?? 60,
      currency: product.currency ?? "KRW",
      sortOrder: product.sortOrder ?? 0,
    });
    setEditingId(product.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("상품명을 입력해주세요.");
      return;
    }
    if (form.price < 1000) {
      toast.error("가격은 최소 1,000원 이상이어야 합니다.");
      return;
    }
    if (form.durationMinutes < 15 || form.durationMinutes > 480) {
      toast.error("시간은 15분~480분 사이여야 합니다.");
      return;
    }

    const payload = {
      name: form.name,
      description: form.description || undefined,
      price: form.price,
      durationMinutes: form.durationMinutes,
      currency: form.currency,
      sortOrder: form.sortOrder,
    };

    if (editingId) {
      updateProduct.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            toast.success("상품이 수정되었습니다.");
            setIsDialogOpen(false);
            resetForm();
          },
          onError: (error) =>
            toast.error(error.message || "수정에 실패했습니다."),
        },
      );
    } else {
      createProduct.mutate(payload, {
        onSuccess: () => {
          toast.success("상품이 생성되었습니다.");
          setIsDialogOpen(false);
          resetForm();
        },
        onError: (error) =>
          toast.error(error.message || "생성에 실패했습니다."),
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteProduct.mutate(id, {
      onSuccess: () => toast.success("상품이 삭제되었습니다."),
      onError: (error) => toast.error(error.message || "삭제에 실패했습니다."),
    });
  };

  const handleToggleStatus = (id: string) => {
    toggleStatus.mutate(id, {
      onSuccess: () => toast.success("상태가 변경되었습니다."),
      onError: (error) =>
        toast.error(error.message || "상태 변경에 실패했습니다."),
    });
  };

  const isMutating = createProduct.isPending || updateProduct.isPending;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">세션 상품 관리</h1>
          <p className="text-sm text-muted-foreground">
            예약 가능한 세션 상품을 생성하고 관리합니다.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          새 상품
        </Button>
      </div>

      {/* 검색 */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="상품명 검색..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-10"
        />
      </div>

      {/* 테이블 */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : products.length === 0 ? (
        <EmptyState onCreateClick={openCreate} />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>상품명</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-right">가격</TableHead>
                  <TableHead className="text-right">시간</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product: ProductRow) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">
                      {product.name}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-muted-foreground">
                      {product.description ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(product.price ?? 0, product.currency ?? "KRW")}
                    </TableCell>
                    <TableCell className="text-right">
                      {product.durationMinutes}분
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={product.isActive !== false}
                        onCheckedChange={() => handleToggleStatus(product.id)}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(product)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeleteConfirmDialog
                          productName={product.name}
                          onConfirm={() => handleDelete(product.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {/* 생성/편집 다이얼로그 */}
      <ProductFormDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}
        form={form}
        onFormChange={setForm}
        isEditing={!!editingId}
        onSubmit={handleSubmit}
        isPending={isMutating}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ProductFormData;
  onFormChange: React.Dispatch<React.SetStateAction<ProductFormData>>;
  isEditing: boolean;
  onSubmit: () => void;
  isPending: boolean;
}

function ProductFormDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  isEditing,
  onSubmit,
  isPending,
}: ProductFormDialogProps) {
  const updateField = <K extends keyof ProductFormData>(
    key: K,
    value: ProductFormData[K],
  ) => {
    onFormChange((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "상품 수정" : "새 상품"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>
              상품명 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="예: 1:1 상담 (60분)"
            />
          </div>
          <div className="space-y-2">
            <Label>설명</Label>
            <Textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="상품에 대한 설명을 입력하세요"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                가격 (원) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                value={form.price}
                onChange={(e) => updateField("price", Number(e.target.value))}
                min={1000}
                step={1000}
              />
              <p className="text-sm text-muted-foreground">최소 1,000원</p>
            </div>
            <div className="space-y-2">
              <Label>
                시간 (분) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                value={form.durationMinutes}
                onChange={(e) =>
                  updateField("durationMinutes", Number(e.target.value))
                }
                min={15}
                max={480}
                step={15}
              />
              <p className="text-sm text-muted-foreground">15분 단위</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>정렬 순서</Label>
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) => updateField("sortOrder", Number(e.target.value))}
            />
            <p className="text-sm text-muted-foreground">
              낮은 숫자가 먼저 표시됩니다
            </p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>취소</DialogClose>
          <Button onClick={onSubmit} disabled={isPending}>
            {isEditing ? "수정" : "생성"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteConfirmDialogProps {
  productName: string;
  onConfirm: () => void;
}

function DeleteConfirmDialog({
  productName,
  onConfirm,
}: DeleteConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <Trash2 className="size-4 text-destructive" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>상품 삭제</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">
              &quot;{productName}&quot;
            </span>
            을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        이전
      </Button>
      <span className="text-sm text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        다음
      </Button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="rounded-lg border">
      <div className="space-y-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="ml-auto h-4 w-20" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-5 w-8 rounded-full" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  onCreateClick: () => void;
}

function EmptyState({ onCreateClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16">
      <div className="rounded-lg bg-muted/50 p-3">
        <Package className="size-6 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="font-medium">세션 상품이 없습니다</p>
        <p className="text-sm text-muted-foreground">
          새 상품을 생성하여 예약을 받아보세요.
        </p>
      </div>
      <Button variant="outline" onClick={onCreateClick}>
        <Plus className="mr-2 size-4" />
        새 상품 만들기
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatPrice(price: number, currency: string) {
  if (currency === "KRW") return `${price.toLocaleString()}원`;
  return `${currency} ${price.toLocaleString()}`;
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const EMPTY_FORM: ProductFormData = {
  name: "",
  description: "",
  price: 0,
  durationMinutes: 60,
  currency: "KRW",
  sortOrder: 0,
};

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface ProductFormData {
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  currency: string;
  sortOrder: number;
}

interface ProductRow {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  durationMinutes?: number | null;
  currency?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
}
