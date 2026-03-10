import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@superbuilder/feature-ui/shadcn/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Switch } from "@superbuilder/feature-ui/shadcn/switch";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import {
  Plus,
  Pencil,
  Trash2,
  Repeat,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAiRecurrences, useAiRecurrenceMutations } from "../hooks";

interface Props {
  studioId: string;
  topics: TopicOption[];
}

export function AiRecurrenceManager({ studioId, topics }: Props) {
  const { data: recurrences, isLoading } = useAiRecurrences(studioId);
  const { create, update, remove, toggle } = useAiRecurrenceMutations(studioId);

  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // 폼 필드
  const [topicId, setTopicId] = useState<string>("");
  const [promptText, setPromptText] = useState("");
  const [rule, setRule] = useState<string>("weekly");

  const resetForm = () => {
    setTopicId("");
    setPromptText("");
    setRule("weekly");
    setEditingId(null);
    setMode("list");
  };

  const handleCreate = () => {
    if (!topicId) return;
    create.mutate(
      {
        studioId,
        topicId,
        prompt: promptText.trim() || undefined,
        rule: rule as "weekly" | "biweekly" | "monthly",
      },
      { onSuccess: resetForm },
    );
  };

  const handleUpdate = () => {
    if (!editingId) return;
    update.mutate(
      {
        id: editingId,
        data: {
          prompt: promptText.trim() || null,
          rule: rule as "weekly" | "biweekly" | "monthly",
        },
      },
      { onSuccess: resetForm },
    );
  };

  const handleEdit = (recurrence: AiRecurrenceItem) => {
    setTopicId(recurrence.topicId);
    setPromptText(recurrence.prompt ?? "");
    setRule(recurrence.rule);
    setEditingId(recurrence.id);
    setMode("edit");
  };

  const handleDelete = (id: string) => {
    setDeleteTarget(id);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      remove.mutate({ id: deleteTarget });
      setDeleteTarget(null);
    }
  };

  const handleToggle = (id: string) => {
    toggle.mutate({ id });
  };

  return (
    <div className="border-t">
      {/* 접이식 헤더 */}
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Repeat className="size-3.5" />
          자동 반복
          {recurrences.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted/50 rounded-full px-1.5">
              {recurrences.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {mode === "list" ? (
            <div className="flex flex-col gap-2">
              {isLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : recurrences.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  AI 자동 추천 반복 규칙이 없습니다
                </p>
              ) : (
                recurrences.map((rec) => (
                  <AiRecurrenceRow
                    key={rec.id}
                    recurrence={rec}
                    onEdit={() => handleEdit(rec)}
                    onDelete={() => handleDelete(rec.id)}
                    onToggle={() => handleToggle(rec.id)}
                  />
                ))
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full mt-1"
                onClick={() => setMode("create")}
              >
                <Plus className="size-3.5" />
                반복 규칙 추가
              </Button>
            </div>
          ) : (
            <AiRecurrenceForm
              mode={mode}
              topics={topics}
              topicId={topicId}
              prompt={promptText}
              rule={rule}
              isPending={create.isPending || update.isPending}
              onTopicIdChange={setTopicId}
              onPromptChange={setPromptText}
              onRuleChange={setRule}
              onSubmit={mode === "create" ? handleCreate : handleUpdate}
              onCancel={resetForm}
            />
          )}
        </div>
      )}

      {/* 반복 규칙 삭제 확인 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>반복 규칙 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 AI 자동 추천 반복 규칙을 삭제하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              삭제
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

function AiRecurrenceRow({
  recurrence,
  onEdit,
  onDelete,
  onToggle,
}: {
  recurrence: AiRecurrenceItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const nextRun = recurrence.nextRunAt
    ? new Date(recurrence.nextRunAt).toLocaleDateString("ko-KR")
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-border/50 p-2.5",
        !recurrence.isActive && "opacity-60",
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {recurrence.prompt || "기본 추천"}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {RULE_LABELS[recurrence.rule] ?? recurrence.rule}
          </span>
          {nextRun && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-xs text-muted-foreground">다음: {nextRun}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Switch checked={recurrence.isActive} onCheckedChange={onToggle} size="sm" />
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onEdit}>
          <Pencil className="size-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onDelete}>
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function AiRecurrenceForm({
  mode,
  topics,
  topicId,
  prompt,
  rule,
  isPending,
  onTopicIdChange,
  onPromptChange,
  onRuleChange,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  topics: TopicOption[];
  topicId: string;
  prompt: string;
  rule: string;
  isPending: boolean;
  onTopicIdChange: (v: string) => void;
  onPromptChange: (v: string) => void;
  onRuleChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* 주제 선택 (생성 모드만) */}
      {mode === "create" && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">주제</label>
          <Select value={topicId} onValueChange={(v) => { if (v) onTopicIdChange(v); }}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="주제 선택" />
            </SelectTrigger>
            <SelectContent>
              {topics.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 프롬프트 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium">프롬프트 (선택)</label>
        <Input
          placeholder="AI 추천 방향 제시"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {/* 주기 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium">주기</label>
        <Select value={rule} onValueChange={(v) => { if (v) onRuleChange(v); }}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">매주</SelectItem>
            <SelectItem value="biweekly">격주</SelectItem>
            <SelectItem value="monthly">매월</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 버튼 */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7" onClick={onCancel}>
          취소
        </Button>
        <Button
          size="sm"
          className="h-7"
          onClick={onSubmit}
          disabled={isPending || (mode === "create" && !topicId)}
        >
          {mode === "create" ? "추가" : "수정"}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const RULE_LABELS: Record<string, string> = {
  weekly: "매주",
  biweekly: "격주",
  monthly: "매월",
};

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface AiRecurrenceItem {
  id: string;
  studioId: string;
  topicId: string;
  prompt: string | null;
  rule: string;
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  totalGenerated: number;
  createdAt: string | null;
}

interface TopicOption {
  id: string;
  label: string;
}
