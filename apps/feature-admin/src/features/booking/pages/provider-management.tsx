import { useState } from "react";
import {
  Search,
  MoreHorizontal,
  UserPlus,
  Clock,
  Globe,
  Briefcase,
} from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Checkbox } from "@superbuilder/feature-ui/shadcn/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@superbuilder/feature-ui/shadcn/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@superbuilder/feature-ui/shadcn/sheet";
import { toast } from "sonner";
import {
  useAdminProviders,
  useAdminProviderDetail,
  useAdminRegisterProvider,
  useUpdateProviderStatus,
  useAdminCategories,
} from "../hooks";
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface Props {}

export function ProviderManagement({}: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data, isLoading } = useAdminProviders({
    page,
    limit: 20,
    status: statusFilter || undefined,
    search: search || undefined,
  });

  const updateStatus = useUpdateProviderStatus();
  const registerProvider = useAdminRegisterProvider();

  // 상태 변경 다이얼로그
  const [statusDialog, setStatusDialog] = useState<StatusDialogState>({
    open: false,
    providerId: "",
    targetStatus: "",
  });
  const [reason, setReason] = useState("");

  // 상세 Sheet
  const [detailProviderId, setDetailProviderId] = useState<string | null>(null);
  const { data: providerDetail, isLoading: isDetailLoading } =
    useAdminProviderDetail(detailProviderId ?? "");

  // 상담사 등록 다이얼로그
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState<RegisterFormData>(
    EMPTY_REGISTER_FORM,
  );

  const handleStatusChange = (providerId: string, targetStatus: string) => {
    setStatusDialog({ open: true, providerId, targetStatus });
    setReason("");
  };

  const confirmStatusChange = () => {
    updateStatus.mutate(
      {
        id: statusDialog.providerId,
        data: {
          status: statusDialog.targetStatus as
            | "active"
            | "inactive"
            | "suspended",
          reason: reason || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("상태가 변경되었습니다.");
          setStatusDialog({ open: false, providerId: "", targetStatus: "" });
        },
        onError: (error) =>
          toast.error(error.message || "상태 변경에 실패했습니다."),
      },
    );
  };

  const handleRegisterSubmit = () => {
    if (!registerForm.userId.trim()) {
      toast.error("프로필 ID를 입력해주세요.");
      return;
    }

    const parsedLanguages = registerForm.languages
      ? registerForm.languages
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean)
      : ["ko"];

    if (!registerForm.categoryIds.length) {
      toast.error("전문분야를 1개 이상 선택해주세요.");
      return;
    }

    registerProvider.mutate(
      {
        userId: registerForm.userId,
        data: {
          bio: registerForm.bio || undefined,
          experienceYears: registerForm.experienceYears ?? undefined,
          consultationMode:
            (registerForm.consultationMode as
              | "online"
              | "offline"
              | "hybrid") ?? "online",
          languages: parsedLanguages,
          categoryIds: registerForm.categoryIds,
        },
      },
      {
        onSuccess: () => {
          toast.success("상담사가 등록되었습니다.");
          setRegisterDialogOpen(false);
          setRegisterForm(EMPTY_REGISTER_FORM);
        },
        onError: (error) =>
          toast.error(error.message || "등록에 실패했습니다."),
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">상담사 관리</h1>
          <p className="text-sm text-muted-foreground">
            등록된 상담사를 조회하고 상태를 관리합니다.
          </p>
        </div>
        <Button onClick={() => setRegisterDialogOpen(true)}>
          <UserPlus className="mr-2 size-4" />
          상담사 등록
        </Button>
      </div>

      {/* 필터 바 */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="이름 또는 이메일 검색..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>
        <Select
          value={statusFilter || "all"}
          onValueChange={(v) => {
            setStatusFilter(v === "all" || !v ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue>
              {STATUS_LABEL_MAP[statusFilter || "all"]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="pending_review">심사중</SelectItem>
            <SelectItem value="active">활성</SelectItem>
            <SelectItem value="inactive">비활성</SelectItem>
            <SelectItem value="suspended">정지</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 테이블 */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : !data?.data?.length ? (
        <div className="py-12 text-center text-muted-foreground">
          {search || statusFilter
            ? "조건에 맞는 상담사가 없습니다."
            : "등록된 상담사가 없습니다."}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>전문분야</TableHead>
                <TableHead className="text-center">상품수</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>등록일</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((provider: ProviderWithDetails) => (
                <TableRow key={provider.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                        {(provider.name ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">
                        {provider.name ?? provider.profileId?.slice(0, 8)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {provider.email ?? "-"}
                  </TableCell>
                  <TableCell>
                    {provider.categories?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {provider.categories.map((cat) => (
                          <Badge
                            key={cat.id}
                            variant="outline"
                            className="border-0 bg-muted/50 text-muted-foreground"
                          >
                            {cat.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/70">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {provider.products?.length ?? 0}
                  </TableCell>
                  <TableCell>
                    <ProviderStatusBadge status={provider.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {provider.createdAt
                      ? new Date(provider.createdAt).toLocaleDateString("ko-KR")
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="sm" />}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => setDetailProviderId(provider.id)}
                        >
                          상세보기
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {provider.status !== "active" && (
                          <DropdownMenuItem
                            onSelect={() =>
                              handleStatusChange(provider.id, "active")
                            }
                          >
                            활성화
                          </DropdownMenuItem>
                        )}
                        {provider.status !== "inactive" && (
                          <DropdownMenuItem
                            onSelect={() =>
                              handleStatusChange(provider.id, "inactive")
                            }
                          >
                            비활성화
                          </DropdownMenuItem>
                        )}
                        {provider.status !== "suspended" && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() =>
                              handleStatusChange(provider.id, "suspended")
                            }
                          >
                            정지
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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

      {/* 상태 변경 다이얼로그 */}
      <Dialog
        open={statusDialog.open}
        onOpenChange={(open) =>
          setStatusDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              상담사 상태 변경 —{" "}
              {STATUS_LABELS[statusDialog.targetStatus] ??
                statusDialog.targetStatus}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>사유 (선택)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="상태 변경 사유를 입력해주세요"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              취소
            </DialogClose>
            <Button
              onClick={confirmStatusChange}
              disabled={updateStatus.isPending}
            >
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 상담사 등록 다이얼로그 */}
      <RegisterProviderDialog
        open={registerDialogOpen}
        onOpenChange={setRegisterDialogOpen}
        form={registerForm}
        onFormChange={setRegisterForm}
        onSubmit={handleRegisterSubmit}
        isPending={registerProvider.isPending}
      />

      {/* 상세 Sheet */}
      <Sheet
        open={!!detailProviderId}
        onOpenChange={(open) => {
          if (!open) setDetailProviderId(null);
        }}
      >
        <SheetContent side="right" className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>상담사 상세 정보</SheetTitle>
          </SheetHeader>

          <div className="space-y-6 p-4">
            {isDetailLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : providerDetail ? (
              <ProviderDetailContent provider={providerDetail} />
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                상담사 정보를 찾을 수 없습니다.
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function ProviderStatusBadge({ status }: { status: string }) {
  const config = PROVIDER_STATUS_MAP[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };

  return (
    <Badge variant="outline" className={cn("border-0", config.className)}>
      {config.label}
    </Badge>
  );
}

interface ProviderDetailContentProps {
  provider: ProviderWithDetails;
}

function ProviderDetailContent({ provider }: ProviderDetailContentProps) {
  return (
    <>
      {/* 프로필 정보 */}
      <DetailSection title="프로필 정보">
        <DetailRow label="이름">
          {provider.name ?? "-"}
        </DetailRow>
        <DetailRow label="이메일">
          {provider.email ?? "-"}
        </DetailRow>
        <DetailRow label="상태">
          <ProviderStatusBadge status={provider.status} />
        </DetailRow>
        {provider.bio && (
          <DetailRow label="소개">
            <p className="whitespace-pre-wrap">{provider.bio}</p>
          </DetailRow>
        )}
        <DetailRow label="경력">
          <div className="flex items-center gap-1.5">
            <Briefcase className="size-3.5 text-muted-foreground" />
            <span>
              {provider.experienceYears != null
                ? `${provider.experienceYears}년`
                : "-"}
            </span>
          </div>
        </DetailRow>
        <DetailRow label="상담 방식">
          <div className="flex items-center gap-1.5">
            <Globe className="size-3.5 text-muted-foreground" />
            <span>
              {CONSULTATION_MODE_LABELS[provider.consultationMode ?? ""] ??
                provider.consultationMode ??
                "-"}
            </span>
          </div>
        </DetailRow>
        {provider.languages?.length ? (
          <DetailRow label="언어">
            <div className="flex flex-wrap gap-1">
              {provider.languages.map((lang) => (
                <Badge
                  key={lang}
                  variant="outline"
                  className="border-0 bg-muted/50"
                >
                  {lang}
                </Badge>
              ))}
            </div>
          </DetailRow>
        ) : null}
      </DetailSection>

      {/* 전문분야 */}
      <DetailSection title="전문분야">
        {provider.categories?.length ? (
          <div className="flex flex-wrap gap-2">
            {provider.categories.map((cat) => (
              <Badge
                key={cat.id}
                variant="outline"
                className="border-0 bg-muted/50"
              >
                {cat.icon ? `${cat.icon} ` : ""}
                {cat.name}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">등록된 전문분야 없음</p>
        )}
      </DetailSection>

      {/* 등록 상품 */}
      <DetailSection title="등록 상품">
        {provider.products?.length ? (
          <div className="space-y-3">
            {provider.products.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{product.name}</p>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" />
                      {product.durationMinutes}분
                    </span>
                  </div>
                </div>
                <span className="text-sm font-medium">
                  {product.price != null
                    ? `${product.price.toLocaleString("ko-KR")}원`
                    : "-"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">등록된 상품 없음</p>
        )}
      </DetailSection>
    </>
  );
}

interface RegisterProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: RegisterFormData;
  onFormChange: (form: RegisterFormData) => void;
  onSubmit: () => void;
  isPending: boolean;
}

function RegisterProviderDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  onSubmit,
  isPending,
}: RegisterProviderDialogProps) {
  const { data: categoriesData } = useAdminCategories({ limit: 100 });
  const categories = categoriesData?.data ?? [];

  const toggleCategory = (categoryId: string) => {
    const next = form.categoryIds.includes(categoryId)
      ? form.categoryIds.filter((id) => id !== categoryId)
      : [...form.categoryIds, categoryId];
    onFormChange({ ...form, categoryIds: next });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>상담사 등록</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>프로필 ID</Label>
            <Input
              value={form.userId}
              onChange={(e) =>
                onFormChange({ ...form, userId: e.target.value })
              }
              placeholder="사용자 프로필 UUID"
            />
            <p className="text-sm text-muted-foreground">
              등록할 사용자의 프로필 ID를 입력합니다.
            </p>
          </div>
          <div className="space-y-2">
            <Label>소개</Label>
            <Textarea
              value={form.bio}
              onChange={(e) => onFormChange({ ...form, bio: e.target.value })}
              placeholder="상담사 소개를 입력해주세요"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>경력 (년)</Label>
              <Input
                type="number"
                min={0}
                value={form.experienceYears ?? ""}
                onChange={(e) =>
                  onFormChange({
                    ...form,
                    experienceYears: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>상담 방식</Label>
              <Select
                value={form.consultationMode ?? "online"}
                onValueChange={(v) =>
                  onFormChange({
                    ...form,
                    consultationMode: v ?? "online",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">온라인</SelectItem>
                  <SelectItem value="offline">오프라인</SelectItem>
                  <SelectItem value="hybrid">온/오프라인</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>언어</Label>
            <Input
              value={form.languages}
              onChange={(e) =>
                onFormChange({ ...form, languages: e.target.value })
              }
              placeholder="예: 한국어, English (쉼표 구분)"
            />
          </div>
          <div className="space-y-2">
            <Label>전문분야</Label>
            {categories.length > 0 ? (
              <div className="space-y-2 rounded-lg border p-3">
                {categories.map((cat) => (
                  <label
                    key={cat.id}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Checkbox
                      checked={form.categoryIds.includes(cat.id)}
                      onCheckedChange={() => toggleCategory(cat.id)}
                    />
                    <span className="text-sm">{cat.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                등록된 카테고리가 없습니다.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>취소</DialogClose>
          <Button onClick={onSubmit} disabled={isPending}>
            등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DetailSectionProps {
  title: string;
  children: React.ReactNode;
}

function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium">{title}</h3>
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
      <span className="w-20 shrink-0 text-sm text-muted-foreground">
        {label}
      </span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

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
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const PROVIDER_STATUS_MAP: Record<
  string,
  { label: string; className: string }
> = {
  pending_review: {
    label: "심사중",
    className: "bg-yellow-100 text-yellow-800",
  },
  active: { label: "활성", className: "bg-green-100 text-green-800" },
  inactive: { label: "비활성", className: "bg-muted text-muted-foreground" },
  suspended: { label: "정지", className: "bg-red-100 text-red-800" },
};

const STATUS_LABELS: Record<string, string> = {
  active: "활성화",
  inactive: "비활성화",
  suspended: "정지",
};

const STATUS_LABEL_MAP: Record<string, string> = {
  all: "전체",
  pending_review: "심사중",
  active: "활성",
  inactive: "비활성",
  suspended: "정지",
};

const CONSULTATION_MODE_LABELS: Record<string, string> = {
  online: "온라인",
  offline: "오프라인",
  hybrid: "온/오프라인",
};

const EMPTY_REGISTER_FORM: RegisterFormData = {
  userId: "",
  bio: "",
  experienceYears: undefined,
  consultationMode: undefined,
  languages: "",
  categoryIds: [],
};

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface StatusDialogState {
  open: boolean;
  providerId: string;
  targetStatus: string;
}

interface RegisterFormData {
  userId: string;
  bio: string;
  experienceYears?: number;
  consultationMode?: string;
  languages: string;
  categoryIds: string[];
}

interface ProviderWithDetails {
  id: string;
  profileId: string;
  name?: string | null;
  email?: string | null;
  avatar?: string | null;
  bio?: string | null;
  experienceYears?: number | null;
  consultationMode?: string | null;
  languages?: string[] | null;
  status: string;
  createdAt?: string | null;
  categories?: Array<{
    id: string;
    name: string;
    slug: string;
    icon?: string | null;
  }>;
  products?: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    price?: number | null;
  }>;
}
