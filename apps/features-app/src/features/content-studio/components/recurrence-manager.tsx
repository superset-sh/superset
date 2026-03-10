import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Switch } from "@superbuilder/feature-ui/shadcn/switch";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Plus, Pencil, Trash2, Play, Repeat, X } from "lucide-react";
import { useRecurrences, useRecurrenceMutations, useCanvasData } from "../hooks";

interface Props {
  studioId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecurrenceManager({ studioId, open, onOpenChange }: Props) {
  const { data: recurrences, isLoading } = useRecurrences(studioId);
  const { create, update, remove, toggle, execute } =
    useRecurrenceMutations(studioId);
  const { data: canvasData } = useCanvasData(studioId);

  // 폼 상태
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);

  // 폼 필드
  const [title, setTitle] = useState("");
  const [ruleType, setRuleType] = useState<string>("weekly");
  const [ruleValue, setRuleValue] = useState<string>("mon");
  const [templateContentId, setTemplateContentId] = useState<string | null>(null);
  const [label, setLabel] = useState("");

  const resetForm = () => {
    setTitle("");
    setRuleType("weekly");
    setRuleValue("mon");
    setTemplateContentId(null);
    setLabel("");
    setEditingId(null);
    setMode("list");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleCreate = () => {
    if (!title.trim()) return;
    const rule = `${ruleType}:${ruleValue}`;
    create.mutate(
      {
        studioId,
        title: title.trim(),
        rule,
        templateContentId: templateContentId ?? undefined,
        label: label.trim() || undefined,
      },
      { onSuccess: resetForm },
    );
  };

  const handleUpdate = () => {
    if (!editingId || !title.trim()) return;
    const rule = `${ruleType}:${ruleValue}`;
    update.mutate(
      {
        id: editingId,
        data: {
          title: title.trim(),
          rule,
          templateContentId: templateContentId ?? undefined,
          label: label.trim() || undefined,
        },
      },
      { onSuccess: resetForm },
    );
  };

  const handleEdit = (recurrence: RecurrenceItem) => {
    const [type, value] = recurrence.rule.split(":");
    setTitle(recurrence.title);
    setRuleType(type ?? "weekly");
    setRuleValue(value ?? "mon");
    setTemplateContentId(recurrence.templateContentId ?? null);
    setLabel(recurrence.label ?? "");
    setEditingId(recurrence.id);
    setMode("edit");
  };

  const handleDelete = (id: string) => {
    remove.mutate({ id });
  };

  const handleToggle = (id: string) => {
    toggle.mutate({ id });
  };

  const handleExecute = (id: string) => {
    execute.mutate({ id });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="size-4" />
            반복 관리
          </DialogTitle>
        </DialogHeader>

        {mode === "list" ? (
          <RecurrenceList
            recurrences={recurrences}
            isLoading={isLoading}
            onAdd={() => setMode("create")}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggle={handleToggle}
            onExecute={handleExecute}
          />
        ) : (
          <RecurrenceForm
            mode={mode}
            title={title}
            ruleType={ruleType}
            ruleValue={ruleValue}
            templateContentId={templateContentId}
            contents={canvasData?.contents ?? []}
            label={label}
            isPending={create.isPending || update.isPending}
            onTitleChange={setTitle}
            onRuleTypeChange={setRuleType}
            onRuleValueChange={setRuleValue}
            onTemplateContentIdChange={setTemplateContentId}
            onLabelChange={setLabel}
            onSubmit={mode === "create" ? handleCreate : handleUpdate}
            onCancel={resetForm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const TEMPLATE_NONE_VALUE = "__none__";

const DAY_OPTIONS = [
  { value: "mon", label: "월요일" },
  { value: "tue", label: "화요일" },
  { value: "wed", label: "수요일" },
  { value: "thu", label: "목요일" },
  { value: "fri", label: "금요일" },
  { value: "sat", label: "토요일" },
  { value: "sun", label: "일요일" },
];

const MONTHLY_OPTIONS = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}일`,
}));

const DAY_NAMES: Record<string, string> = {
  mon: "월",
  tue: "화",
  wed: "수",
  thu: "목",
  fri: "금",
  sat: "토",
  sun: "일",
};

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function RecurrenceList({
  recurrences,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
  onExecute,
}: {
  recurrences: RecurrenceItem[];
  isLoading: boolean;
  onAdd: () => void;
  onEdit: (recurrence: RecurrenceItem) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onExecute: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {recurrences.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Repeat className="size-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            등록된 반복 규칙이 없습니다
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            반복 규칙을 추가하여 콘텐츠를 자동 생성하세요
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {recurrences.map((recurrence) => (
            <RecurrenceRow
              key={recurrence.id}
              recurrence={recurrence}
              onEdit={() => onEdit(recurrence)}
              onDelete={() => onDelete(recurrence.id)}
              onToggle={() => onToggle(recurrence.id)}
              onExecute={() => onExecute(recurrence.id)}
            />
          ))}
        </div>
      )}

      <Separator />

      <Button variant="outline" onClick={onAdd} className="w-full">
        <Plus className="size-4" />
        반복 규칙 추가
      </Button>
    </div>
  );
}

function RecurrenceRow({
  recurrence,
  onEdit,
  onDelete,
  onToggle,
  onExecute,
}: {
  recurrence: RecurrenceItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onExecute: () => void;
}) {
  const nextRun = recurrence.nextRunAt
    ? new Date(recurrence.nextRunAt).toLocaleDateString("ko-KR")
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border border-border/50 p-3",
        !recurrence.isActive && "opacity-60",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{recurrence.title}</p>
          {recurrence.label && (
            <span className="text-xs text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
              {recurrence.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-muted-foreground">
            {formatRule(recurrence.rule)}
          </span>
          {nextRun && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-sm text-muted-foreground">
                다음: {nextRun}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Switch
          checked={recurrence.isActive}
          onCheckedChange={onToggle}
          size="sm"
        />
        <Button variant="ghost" size="icon-sm" onClick={onExecute}>
          <Play className="size-3.5" />
          <span className="sr-only">수동 실행</span>
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onEdit}>
          <Pencil className="size-3.5" />
          <span className="sr-only">편집</span>
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete}>
          <Trash2 className="size-3.5" />
          <span className="sr-only">삭제</span>
        </Button>
      </div>
    </div>
  );
}

function RecurrenceForm({
  mode,
  title,
  ruleType,
  ruleValue,
  templateContentId,
  contents,
  label,
  isPending,
  onTitleChange,
  onRuleTypeChange,
  onRuleValueChange,
  onTemplateContentIdChange,
  onLabelChange,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  title: string;
  ruleType: string;
  ruleValue: string;
  templateContentId: string | null;
  contents: ContentOption[];
  label: string;
  isPending: boolean;
  onTitleChange: (v: string) => void;
  onRuleTypeChange: (v: string) => void;
  onRuleValueChange: (v: string) => void;
  onTemplateContentIdChange: (v: string | null) => void;
  onLabelChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const valueOptions = ruleType === "monthly" ? MONTHLY_OPTIONS : DAY_OPTIONS;

  // ruleType 변경 시 기본값 설정
  const handleRuleTypeChange = (v: string) => {
    onRuleTypeChange(v);
    if (v === "monthly") {
      onRuleValueChange("1");
    } else {
      onRuleValueChange("mon");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {/* 이름 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">이름</label>
          <Input
            placeholder="반복 규칙 이름"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
          />
        </div>

        {/* 주기 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">주기</label>
          <div className="flex items-center gap-2">
            <Select
              value={ruleType}
              onValueChange={(v) => {
                if (v) handleRuleTypeChange(v);
              }}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">매주</SelectItem>
                <SelectItem value="biweekly">격주</SelectItem>
                <SelectItem value="monthly">매월</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={ruleValue}
              onValueChange={(v) => {
                if (v) onRuleValueChange(v);
              }}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {valueOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 템플릿 콘텐츠 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">템플릿 콘텐츠 (선택)</label>
          <Select
            value={templateContentId ?? TEMPLATE_NONE_VALUE}
            onValueChange={(v) => {
              if (v === null) return;
              onTemplateContentIdChange(v === TEMPLATE_NONE_VALUE ? null : v);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="템플릿 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TEMPLATE_NONE_VALUE}>
                없음 (빈 draft 생성)
              </SelectItem>
              {contents.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            반복 실행 시 선택한 콘텐츠를 복제하여 새 draft를 생성합니다
          </p>
        </div>

        {/* 라벨 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">라벨 (선택)</label>
          <Input
            placeholder="예: 주간 뉴스레터"
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
          />
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          <X className="size-4" />
          취소
        </Button>
        <Button
          onClick={onSubmit}
          disabled={isPending || !title.trim()}
        >
          {mode === "create" ? "추가" : "수정"}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Hooks
 * -----------------------------------------------------------------------------------------------*/

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatRule(rule: string): string {
  const [type, value] = rule.split(":");
  switch (type) {
    case "weekly":
      return `매주 ${DAY_NAMES[value ?? ""] ?? value}요일`;
    case "biweekly":
      return `격주 ${DAY_NAMES[value ?? ""] ?? value}요일`;
    case "monthly":
      return `매월 ${value}일`;
    default:
      return rule;
  }
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface RecurrenceItem {
  id: string;
  title: string;
  rule: string;
  label: string | null;
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  templateContentId: string | null;
  createdAt: string | null;
}

interface ContentOption {
  id: string;
  title: string;
  status: string;
}
