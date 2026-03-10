import { useState } from "react";
import { Plus, Pencil, Trash2, X, ShieldCheck } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Checkbox } from "@superbuilder/feature-ui/shadcn/checkbox";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
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
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { toast } from "sonner";
import {
  useRefundPolicies,
  useCreateRefundPolicy,
  useUpdateRefundPolicy,
  useDeleteRefundPolicy,
} from "../hooks";

interface Props {}

export function RefundPolicyManagement({}: Props) {
  const { data: policies, isLoading } = useRefundPolicies();
  const createPolicy = useCreateRefundPolicy();
  const updatePolicy = useUpdateRefundPolicy();
  const deletePolicy = useDeleteRefundPolicy();

  const [form, setForm] = useState<PolicyFormData>({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const resetForm = () => {
    setForm({
      ...EMPTY_FORM,
      rules: [{ ...EMPTY_RULE }],
    });
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEdit = (policy: PolicyRow) => {
    const rules =
      Array.isArray(policy.rules) && policy.rules.length > 0
        ? (policy.rules as RefundRule[])
        : [{ ...EMPTY_RULE }];

    setForm({
      name: policy.name,
      description: policy.description ?? "",
      rules,
      noShowRefundPercentage: policy.noShowRefundPercentage ?? 0,
      providerCancelRefundPercentage:
        policy.providerCancelRefundPercentage ?? 100,
      isDefault: policy.isDefault ?? false,
    });
    setEditingId(policy.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("정책명을 입력해주세요.");
      return;
    }
    if (form.rules.length === 0) {
      toast.error("최소 1개의 환불 규칙이 필요합니다.");
      return;
    }

    const hasInvalidRule = form.rules.some(
      (rule) =>
        rule.hours_before < 0 ||
        rule.refund_percentage < 0 ||
        rule.refund_percentage > 100,
    );
    if (hasInvalidRule) {
      toast.error("환불 규칙 값을 확인해주세요.");
      return;
    }

    const payload = {
      name: form.name,
      rules: form.rules,
      noShowRefundPercentage: form.noShowRefundPercentage,
      providerCancelRefundPercentage: form.providerCancelRefundPercentage,
      isDefault: form.isDefault,
    };

    if (editingId) {
      updatePolicy.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            toast.success("정책이 수정되었습니다.");
            setIsDialogOpen(false);
            resetForm();
          },
          onError: (error) =>
            toast.error(error.message || "수정에 실패했습니다."),
        },
      );
    } else {
      createPolicy.mutate(payload, {
        onSuccess: () => {
          toast.success("정책이 생성되었습니다.");
          setIsDialogOpen(false);
          resetForm();
        },
        onError: (error) =>
          toast.error(error.message || "생성에 실패했습니다."),
      });
    }
  };

  const handleDelete = (id: string) => {
    deletePolicy.mutate(id, {
      onSuccess: () => toast.success("정책이 삭제되었습니다."),
      onError: (error) => toast.error(error.message || "삭제에 실패했습니다."),
    });
  };

  const isMutating = createPolicy.isPending || updatePolicy.isPending;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">환불 정책 관리</h1>
          <p className="text-sm text-muted-foreground">
            세션 취소 시 적용되는 환불 정책을 관리합니다.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          새 정책
        </Button>
      </div>

      {/* 정책 카드 목록 */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : !policies?.length ? (
        <EmptyState onCreateClick={openCreate} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {policies.map((policy: PolicyRow) => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              onEdit={() => openEdit(policy)}
              onDelete={() => handleDelete(policy.id)}
            />
          ))}
        </div>
      )}

      {/* 생성/편집 다이얼로그 */}
      <PolicyFormDialog
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

interface PolicyCardProps {
  policy: PolicyRow;
  onEdit: () => void;
  onDelete: () => void;
}

function PolicyCard({ policy, onEdit, onDelete }: PolicyCardProps) {
  const rules = Array.isArray(policy.rules)
    ? ([...policy.rules] as RefundRule[]).sort(
        (a, b) => b.hours_before - a.hours_before,
      )
    : [];

  const isDefault = policy.isDefault ?? false;
  const isActive = policy.isActive !== false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="leading-snug">{policy.name}</CardTitle>
          <div className="flex shrink-0 items-center gap-1.5">
            {isDefault && (
              <Badge variant="default" className="text-xs">
                기본 정책
              </Badge>
            )}
            {!isActive && (
              <Badge variant="outline" className="border-0 bg-muted text-xs">
                비활성
              </Badge>
            )}
          </div>
        </div>
        {policy.description && (
          <CardDescription>{policy.description}</CardDescription>
        )}
      </CardHeader>

      <CardContent>
        {rules.length > 0 ? (
          <RulesTimeline rules={rules} />
        ) : (
          <p className="text-sm text-muted-foreground">규칙 없음</p>
        )}
      </CardContent>

      <CardFooter className="gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="mr-1.5 size-3.5" />
          편집
        </Button>
        {isDefault ? (
          <Button variant="ghost" size="sm" disabled>
            <Trash2 className="mr-1.5 size-3.5" />
            삭제
          </Button>
        ) : (
          <DeleteConfirmDialog
            policyName={policy.name}
            onConfirm={onDelete}
          />
        )}
      </CardFooter>
    </Card>
  );
}

interface RulesTimelineProps {
  rules: RefundRule[];
}

function RulesTimeline({ rules }: RulesTimelineProps) {
  return (
    <div className="space-y-0">
      {rules.map((rule, index) => (
        <div key={index} className="flex items-start gap-3">
          {/* 타임라인 도트 + 커넥터 */}
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                rule.refund_percentage === 100
                  ? "bg-green-600"
                  : rule.refund_percentage === 0
                    ? "bg-destructive"
                    : "bg-yellow-600",
              )}
            />
            {index < rules.length - 1 && (
              <div className="w-px grow bg-border" style={{ minHeight: 20 }} />
            )}
          </div>
          {/* 규칙 텍스트 */}
          <div className="pb-3">
            <p className="text-sm leading-relaxed">
              <span className="font-medium">{rule.hours_before}시간</span>
              <span className="text-muted-foreground"> 전: </span>
              <span
                className={cn(
                  "font-medium",
                  rule.refund_percentage === 100
                    ? "text-green-600"
                    : rule.refund_percentage === 0
                      ? "text-destructive"
                      : "text-yellow-600",
                )}
              >
                {rule.refund_percentage}% 환불
              </span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

interface PolicyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: PolicyFormData;
  onFormChange: React.Dispatch<React.SetStateAction<PolicyFormData>>;
  isEditing: boolean;
  onSubmit: () => void;
  isPending: boolean;
}

function PolicyFormDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  isEditing,
  onSubmit,
  isPending,
}: PolicyFormDialogProps) {
  const addRule = () => {
    onFormChange((prev) => ({
      ...prev,
      rules: [...prev.rules, { ...EMPTY_RULE }],
    }));
  };

  const removeRule = (index: number) => {
    onFormChange((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }));
  };

  const updateRule = (
    index: number,
    field: keyof RefundRule,
    value: number,
  ) => {
    onFormChange((prev) => ({
      ...prev,
      rules: prev.rules.map((rule, i) =>
        i === index ? { ...rule, [field]: value } : rule,
      ),
    }));
  };

  // 규칙을 hours_before 내림차순으로 표시
  const sortedRuleIndices = form.rules
    .map((_, index) => index)
    .sort((a, b) => {
      const ruleA = form.rules[a];
      const ruleB = form.rules[b];
      if (!ruleA || !ruleB) return 0;
      return ruleB.hours_before - ruleA.hours_before;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "정책 수정" : "새 환불 정책"}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {/* 정책명 */}
          <div className="space-y-2">
            <Label>
              정책명 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) =>
                onFormChange((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="예: 기본 환불 정책"
            />
          </div>

          {/* 설명 */}
          <div className="space-y-2">
            <Label>설명</Label>
            <Textarea
              value={form.description}
              onChange={(e) =>
                onFormChange((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="정책에 대한 설명을 입력하세요"
              rows={2}
            />
          </div>

          {/* 기본 정책 여부 */}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={form.isDefault}
              onCheckedChange={(checked) =>
                onFormChange((prev) => ({
                  ...prev,
                  isDefault: checked === true,
                }))
              }
            />
            <Label className="cursor-pointer">기본 정책으로 설정</Label>
          </div>

          {/* 환불 규칙 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>환불 규칙</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={addRule}
                type="button"
              >
                <Plus className="mr-1 size-3" />
                규칙 추가
              </Button>
            </div>
            <div className="space-y-2">
              {sortedRuleIndices.map((originalIndex) => {
                const rule = form.rules[originalIndex];
                if (!rule) return null;
                return (
                  <div
                    key={originalIndex}
                    className="flex items-end gap-2 rounded-md bg-muted/30 p-3"
                  >
                    <div className="flex-1 space-y-1">
                      <span className="text-sm text-muted-foreground">
                        시작 전 (시간)
                      </span>
                      <Input
                        type="number"
                        value={rule.hours_before}
                        onChange={(e) =>
                          updateRule(
                            originalIndex,
                            "hours_before",
                            Number(e.target.value),
                          )
                        }
                        min={0}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <span className="text-sm text-muted-foreground">
                        환불 비율 (%)
                      </span>
                      <Input
                        type="number"
                        value={rule.refund_percentage}
                        onChange={(e) =>
                          updateRule(
                            originalIndex,
                            "refund_percentage",
                            Number(e.target.value),
                          )
                        }
                        min={0}
                        max={100}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeRule(originalIndex)}
                      disabled={form.rules.length <= 1}
                    >
                      <X className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground">
              세션 시작 전 시간에 따라 환불 비율이 적용됩니다.
            </p>
          </div>

          {/* 추가 비율 설정 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>노쇼 환불 비율 (%)</Label>
              <Input
                type="number"
                value={form.noShowRefundPercentage}
                onChange={(e) =>
                  onFormChange((prev) => ({
                    ...prev,
                    noShowRefundPercentage: Number(e.target.value),
                  }))
                }
                min={0}
                max={100}
              />
            </div>
            <div className="space-y-2">
              <Label>상담사 취소 환불 (%)</Label>
              <Input
                type="number"
                value={form.providerCancelRefundPercentage}
                onChange={(e) =>
                  onFormChange((prev) => ({
                    ...prev,
                    providerCancelRefundPercentage: Number(e.target.value),
                  }))
                }
                min={0}
                max={100}
              />
            </div>
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
  policyName: string;
  onConfirm: () => void;
}

function DeleteConfirmDialog({
  policyName,
  onConfirm,
}: DeleteConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
        <Trash2 className="mr-1.5 size-3.5 text-destructive" />
        삭제
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>정책 삭제</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">
              &quot;{policyName}&quot;
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

function LoadingSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-32" />
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-16" />
          </CardFooter>
        </Card>
      ))}
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
        <ShieldCheck className="size-6 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="font-medium">환불 정책이 없습니다</p>
        <p className="text-sm text-muted-foreground">
          새 환불 정책을 생성하여 취소 시 환불 규칙을 설정하세요.
        </p>
      </div>
      <Button variant="outline" onClick={onCreateClick}>
        <Plus className="mr-2 size-4" />
        새 정책 만들기
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const EMPTY_RULE: RefundRule = {
  hours_before: 24,
  refund_percentage: 100,
};

const EMPTY_FORM: PolicyFormData = {
  name: "",
  description: "",
  rules: [{ ...EMPTY_RULE }],
  noShowRefundPercentage: 0,
  providerCancelRefundPercentage: 100,
  isDefault: false,
};

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface RefundRule {
  hours_before: number;
  refund_percentage: number;
}

interface PolicyFormData {
  name: string;
  description: string;
  rules: RefundRule[];
  noShowRefundPercentage: number;
  providerCancelRefundPercentage: number;
  isDefault: boolean;
}

interface PolicyRow {
  id: string;
  name: string;
  description?: string | null;
  rules?: RefundRule[] | unknown;
  noShowRefundPercentage?: number | null;
  providerCancelRefundPercentage?: number | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;
}
