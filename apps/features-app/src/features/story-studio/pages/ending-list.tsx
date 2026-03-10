/**
 * EndingList - 엔딩 관리
 */
import { useState } from "react";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Crown, Pencil, Plus, Trash2 } from "lucide-react";
import { ConditionBuilder } from "../components/graph/condition-builder";
import { useCreateEnding, useDeleteEnding, useEndings, useFlags, useUpdateEnding } from "../hooks";

const ENDING_TYPE_OPTIONS = [
  { value: "true_end", label: "트루 엔딩" },
  { value: "normal_end", label: "노말 엔딩" },
  { value: "bad_end", label: "배드 엔딩" },
  { value: "hidden_end", label: "히든 엔딩" },
  { value: "secret_end", label: "시크릿 엔딩" },
];

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "쉬움" },
  { value: "normal", label: "보통" },
  { value: "hard", label: "어려움" },
  { value: "very_hard", label: "매우 어려움" },
];

const TYPE_COLORS: Record<string, string> = {
  true_end: "border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950",
  normal_end: "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950",
  bad_end: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950",
  hidden_end: "border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950",
  secret_end: "border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
  very_hard: "매우 어려움",
};

export function EndingList() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();
  const projectId = id ?? "";

  const { data: endings, isLoading } = useEndings(projectId);
  const createEnding = useCreateEnding(projectId);
  const updateEnding = useUpdateEnding(projectId);
  const deleteEnding = useDeleteEnding(projectId);
  const { data: flags } = useFlags(projectId);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingEnding, setEditingEnding] = useState<EndingData | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("normal_end");
  const [difficulty, setDifficulty] = useState("normal");
  const [description, setDescription] = useState("");
  const [discoveryHint, setDiscoveryHint] = useState("");

  const handleCreate = () => {
    if (!title.trim()) return;
    createEnding.mutate(
      {
        projectId,
        title: title.trim(),
        type,
        description: description.trim() || undefined,
        difficulty,
        discoveryHint: discoveryHint.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          resetForm();
        },
      },
    );
  };

  const resetForm = () => {
    setTitle("");
    setType("normal_end");
    setDifficulty("normal");
    setDescription("");
    setDiscoveryHint("");
  };

  const handleDelete = (endingId: string) => {
    if (window.confirm("이 엔딩을 삭제하시겠습니까?")) {
      deleteEnding.mutate({ id: endingId });
    }
  };

  if (isLoading) {
    return <EndingSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/story-studio/$id", params: { id: projectId } })}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            프로젝트
          </Button>
          <h1 className="text-2xl font-bold">엔딩 관리</h1>
          <Badge variant="outline">{endings?.length ?? 0}개 엔딩</Badge>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1 h-4 w-4" />
            엔딩 추가
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>새 엔딩 추가</DialogTitle>
              <DialogDescription>
                스토리의 결말을 정의합니다. 조건은 생성 후 편집에서 설정할 수 있습니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>엔딩 제목</Label>
                <Input
                  placeholder="예: 영웅의 귀환"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>엔딩 유형</Label>
                  <Select value={type} onValueChange={(val) => setType(val ?? "normal_end")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENDING_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>도달 난이도</Label>
                  <Select
                    value={difficulty}
                    onValueChange={(val) => setDifficulty(val ?? "normal")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>설명</Label>
                <Textarea
                  placeholder="이 엔딩의 상황을 설명하세요"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>발견 힌트</Label>
                <Input
                  placeholder="플레이어를 위한 발견 힌트 (선택)"
                  value={discoveryHint}
                  onChange={(e) => setDiscoveryHint(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCreateOpen(false);
                  resetForm();
                }}
              >
                취소
              </Button>
              <Button onClick={handleCreate} disabled={!title.trim() || createEnding.isPending}>
                {createEnding.isPending ? "추가 중..." : "추가"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Ending Cards Grid */}
      {!endings || endings.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <Crown className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
            <p className="text-muted-foreground">엔딩이 없습니다</p>
            <p className="text-muted-foreground mt-1 text-sm">
              플레이어가 도달할 수 있는 엔딩을 추가하세요
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {endings.map((ending) => (
            <EndingCard
              key={ending.id}
              ending={ending}
              onEdit={setEditingEnding}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <EditEndingDialog
        ending={editingEnding}
        flags={flags ?? []}
        isPending={updateEnding.isPending}
        onClose={() => setEditingEnding(null)}
        onSave={(data) => {
          if (!editingEnding) return;
          updateEnding.mutate(
            { id: editingEnding.id, data },
            { onSuccess: () => setEditingEnding(null) },
          );
        }}
      />
    </div>
  );
}

/* Types */

interface Condition {
  type: "flag_check" | "group";
  flagId?: string;
  operator?: "==" | "!=" | ">" | ">=" | "<" | "<=";
  value?: string | number | boolean;
  logic?: "AND" | "OR";
  children?: Condition[];
}

interface EndingData {
  id: string;
  title: string;
  type: string | null;
  description: string | null;
  difficulty: string | null;
  discoveryHint: string | null;
  requiredFlags: Condition[] | null;
}

/* Components */

interface EndingCardProps {
  ending: EndingData;
  onEdit: (ending: EndingData) => void;
  onDelete: (id: string) => void;
}

function EndingCard({ ending, onEdit, onDelete }: EndingCardProps) {
  const typeLabel =
    ENDING_TYPE_OPTIONS.find((o) => o.value === ending.type)?.label ?? ending.type ?? "미지정";
  const cardColor = TYPE_COLORS[ending.type ?? ""] ?? "";

  return (
    <Card className={cn("transition-colors hover:shadow-md", cardColor)}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">{ending.title}</CardTitle>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(ending)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onDelete(ending.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <EndingTypeBadge type={ending.type} label={typeLabel} />
          {ending.difficulty ? (
            <Badge variant="outline" className="text-xs">
              {DIFFICULTY_LABELS[ending.difficulty] ?? ending.difficulty}
            </Badge>
          ) : null}
        </div>
        {ending.description ? (
          <p className="text-muted-foreground line-clamp-2 text-sm">{ending.description}</p>
        ) : null}
        {ending.discoveryHint ? (
          <p className="text-muted-foreground border-t pt-2 text-xs italic">
            힌트: {ending.discoveryHint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EndingTypeBadge({ type, label }: { type: string | null; label: string }) {
  const variantMap: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
    true_end: "default",
    normal_end: "default",
    bad_end: "destructive",
    hidden_end: "secondary",
    secret_end: "secondary",
  };
  return <Badge variant={variantMap[type ?? ""] ?? "outline"}>{label}</Badge>;
}

interface EditEndingDialogProps {
  ending: EndingData | null;
  flags: { id: string; name: string; category: string }[];
  isPending: boolean;
  onClose: () => void;
  onSave: (data: {
    title?: string;
    type?: string;
    description?: string;
    difficulty?: string;
    discoveryHint?: string;
    requiredFlags?: Condition[];
  }) => void;
}

function EditEndingDialog({ ending, flags, isPending, onClose, onSave }: EditEndingDialogProps) {
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("normal_end");
  const [editDescription, setEditDescription] = useState("");
  const [editDifficulty, setEditDifficulty] = useState("normal");
  const [editDiscoveryHint, setEditDiscoveryHint] = useState("");
  const [editRequiredFlags, setEditRequiredFlags] = useState<Condition[]>([]);

  // Sync form state when ending changes (dialog opens with new ending)
  const [prevEndingId, setPrevEndingId] = useState<string | null>(null);
  if (ending && ending.id !== prevEndingId) {
    setPrevEndingId(ending.id);
    setEditTitle(ending.title);
    setEditType(ending.type ?? "normal_end");
    setEditDescription(ending.description ?? "");
    setEditDifficulty(ending.difficulty ?? "normal");
    setEditDiscoveryHint(ending.discoveryHint ?? "");
    setEditRequiredFlags(ending.requiredFlags ?? []);
  }

  if (!ending && prevEndingId !== null) {
    setPrevEndingId(null);
  }

  const handleSave = () => {
    if (!editTitle.trim()) return;
    onSave({
      title: editTitle.trim(),
      type: editType,
      description: editDescription.trim() || undefined,
      difficulty: editDifficulty,
      discoveryHint: editDiscoveryHint.trim() || undefined,
      requiredFlags: editRequiredFlags.length > 0 ? editRequiredFlags : undefined,
    });
  };

  return (
    <Dialog open={!!ending} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>엔딩 편집</DialogTitle>
          <DialogDescription>엔딩의 정보와 도달 조건을 수정합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>엔딩 제목</Label>
            <Input
              placeholder="예: 영웅의 귀환"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>엔딩 유형</Label>
              <Select value={editType} onValueChange={(val) => setEditType(val ?? "normal_end")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENDING_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>도달 난이도</Label>
              <Select
                value={editDifficulty}
                onValueChange={(val) => setEditDifficulty(val ?? "normal")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>설명</Label>
            <Textarea
              placeholder="이 엔딩의 상황을 설명하세요"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>발견 힌트</Label>
            <Textarea
              placeholder="플레이어를 위한 발견 힌트 (선택)"
              value={editDiscoveryHint}
              onChange={(e) => setEditDiscoveryHint(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>도달 조건 (플래그)</Label>
            <ConditionBuilder
              conditions={editRequiredFlags}
              flags={flags}
              onChange={setEditRequiredFlags}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={!editTitle.trim() || isPending}>
            {isPending ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EndingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full" />
        ))}
      </div>
    </div>
  );
}
