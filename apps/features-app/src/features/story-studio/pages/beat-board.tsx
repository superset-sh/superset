/**
 * BeatBoard - 비트 보드 관리 (Act 기반 카드 레이아웃)
 */
import { useState } from "react";
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
import { ArrowLeft, GripVertical, LayoutGrid, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useBeatTemplates,
  useBeatsByProject,
  useChapters,
  useCreateBeat,
  useDeleteBeat,
  useUpdateBeat,
} from "../hooks";

const ACT_OPTIONS = [
  { value: "act_1", label: "1막: 설정" },
  { value: "act_2a", label: "2막A: 대립 (전반)" },
  { value: "act_2b", label: "2막B: 대립 (후반)" },
  { value: "act_3", label: "3막: 해결" },
] as const;

const ACT_LABELS: Record<string, string> = {
  act_1: "1막: 설정",
  act_2a: "2막A: 대립 (전반)",
  act_2b: "2막B: 대립 (후반)",
  act_3: "3막: 해결",
};

const ACT_COLORS: Record<string, string> = {
  act_1: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950",
  act_2a: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950",
  act_2b: "border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950",
  act_3: "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950",
};

const ACT_KEYS = ["act_1", "act_2a", "act_2b", "act_3"] as const;

const BEAT_TYPE_OPTIONS = [
  { value: "opening_image", label: "오프닝 이미지" },
  { value: "setup", label: "설정" },
  { value: "theme_stated", label: "테마 선언" },
  { value: "catalyst", label: "촉매" },
  { value: "debate", label: "토론" },
  { value: "break_into_two", label: "2막 진입" },
  { value: "b_story", label: "B 스토리" },
  { value: "fun_and_games", label: "재미와 게임" },
  { value: "midpoint", label: "중간점" },
  { value: "bad_guys_close_in", label: "적의 접근" },
  { value: "all_is_lost", label: "모든 것을 잃다" },
  { value: "dark_night", label: "암흑의 밤" },
  { value: "break_into_three", label: "3막 진입" },
  { value: "finale", label: "피날레" },
  { value: "final_image", label: "파이널 이미지" },
  { value: "climax", label: "클라이맥스" },
  { value: "resolution", label: "해결" },
  { value: "custom", label: "커스텀" },
];

const EMOTIONAL_TONE_OPTIONS = [
  { value: "hope", label: "희망" },
  { value: "despair", label: "절망" },
  { value: "tension", label: "긴장" },
  { value: "relief", label: "안도" },
  { value: "mystery", label: "미스터리" },
  { value: "joy", label: "기쁨" },
  { value: "sorrow", label: "슬픔" },
  { value: "anger", label: "분노" },
  { value: "fear", label: "공포" },
  { value: "neutral", label: "중립" },
];

export function BeatBoard() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();
  const projectId = id ?? "";

  const { data: beats, isLoading } = useBeatsByProject(projectId);
  const { data: chapters } = useChapters(projectId);
  const { data: templates } = useBeatTemplates();
  const createBeat = useCreateBeat(projectId);
  const deleteBeat = useDeleteBeat(projectId);
  const updateBeat = useUpdateBeat(projectId);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [act, setAct] = useState("act_1");
  const [beatType, setBeatType] = useState("custom");
  const [chapterId, setChapterId] = useState("");
  const [summary, setSummary] = useState("");
  const [emotionalTone, setEmotionalTone] = useState("");

  const [editingBeat, setEditingBeat] = useState<{
    id: string;
    title: string;
    act: string;
    beatType: string | null;
    summary: string | null;
    emotionalTone: string | null;
  } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAct, setEditAct] = useState("act_1");
  const [editBeatType, setEditBeatType] = useState("custom");
  const [editSummary, setEditSummary] = useState("");
  const [editEmotionalTone, setEditEmotionalTone] = useState("");

  const beatsByAct: Record<string, typeof beats extends (infer T)[] | undefined ? T[] : never[]> = {
    act_1: beats?.filter((b) => b.act === "act_1") ?? [],
    act_2a: beats?.filter((b) => b.act === "act_2a") ?? [],
    act_2b: beats?.filter((b) => b.act === "act_2b") ?? [],
    act_3: beats?.filter((b) => b.act === "act_3") ?? [],
  };

  const handleCreate = () => {
    if (!title.trim() || !chapterId) return;
    createBeat.mutate(
      {
        projectId,
        chapterId,
        title: title.trim(),
        act,
        beatType,
        summary: summary.trim() || undefined,
        emotionalTone: emotionalTone || undefined,
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
    setAct("act_1");
    setBeatType("custom");
    setChapterId("");
    setSummary("");
    setEmotionalTone("");
  };

  const handleDelete = (beatId: string) => {
    if (window.confirm("이 비트를 삭제하시겠습니까?")) {
      deleteBeat.mutate({ id: beatId });
    }
  };

  const handleEdit = (beat: NonNullable<typeof editingBeat>) => {
    setEditingBeat(beat);
    setEditTitle(beat.title);
    setEditAct(beat.act);
    setEditBeatType(beat.beatType ?? "custom");
    setEditSummary(beat.summary ?? "");
    setEditEmotionalTone(beat.emotionalTone ?? "");
  };

  const handleEditSave = () => {
    if (!editingBeat || !editTitle.trim()) return;
    updateBeat.mutate(
      {
        id: editingBeat.id,
        data: {
          title: editTitle.trim(),
          act: editAct,
          beatType: editBeatType,
          summary: editSummary.trim() || undefined,
          emotionalTone: editEmotionalTone || undefined,
        },
      },
      {
        onSuccess: () => {
          setEditingBeat(null);
        },
      },
    );
  };

  if (isLoading) {
    return <BeatBoardSkeleton />;
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
          <h1 className="text-2xl font-bold">비트 보드</h1>
          <Badge variant="outline">{beats?.length ?? 0}개 비트</Badge>
        </div>
        <div className="flex items-center gap-2">
          {templates && templates.length > 0 ? <TemplateInfo count={templates.length} /> : null}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-1 h-4 w-4" />
              비트 추가
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>새 비트 추가</DialogTitle>
                <DialogDescription>스토리의 구조적 단위인 비트를 추가합니다.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>제목</Label>
                  <Input
                    placeholder="비트 제목"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>챕터</Label>
                    <Select value={chapterId} onValueChange={(val) => setChapterId(val ?? "")}>
                      <SelectTrigger>
                        <SelectValue placeholder="챕터 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {chapters?.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id}>
                            {ch.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>막 (Act)</Label>
                    <Select value={act} onValueChange={(val) => setAct(val ?? "act_1")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>비트 타입</Label>
                    <Select value={beatType} onValueChange={(val) => setBeatType(val ?? "custom")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BEAT_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>감정 톤</Label>
                    <Select
                      value={emotionalTone}
                      onValueChange={(val) => setEmotionalTone(val ?? "")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="선택 (옵션)" />
                      </SelectTrigger>
                      <SelectContent>
                        {EMOTIONAL_TONE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>요약</Label>
                  <Textarea
                    placeholder="이 비트에서 일어나는 일을 설명하세요"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={3}
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
                <Button
                  onClick={handleCreate}
                  disabled={!title.trim() || !chapterId || createBeat.isPending}
                >
                  {createBeat.isPending ? "추가 중..." : "추가"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Act Columns */}
      <div className="grid gap-6 lg:grid-cols-4">
        {ACT_KEYS.map((actKey) => (
          <div key={actKey} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{ACT_LABELS[actKey]}</h2>
              <Badge variant="secondary">{beatsByAct[actKey]?.length ?? 0}</Badge>
            </div>
            <div className="space-y-2">
              {!beatsByAct[actKey] || beatsByAct[actKey].length === 0 ? (
                <Card className={ACT_COLORS[actKey]}>
                  <CardContent className="py-8 text-center">
                    <LayoutGrid className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
                    <p className="text-muted-foreground text-sm">비트를 추가하세요</p>
                  </CardContent>
                </Card>
              ) : (
                beatsByAct[actKey].map((beat) => (
                  <BeatCard
                    key={beat.id}
                    beat={beat}
                    actColor={ACT_COLORS[actKey] ?? ""}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Beat Dialog */}
      <EditBeatDialog
        editingBeat={editingBeat}
        onOpenChange={(open) => (!open ? setEditingBeat(null) : undefined)}
        editTitle={editTitle}
        onEditTitleChange={setEditTitle}
        editAct={editAct}
        onEditActChange={setEditAct}
        editBeatType={editBeatType}
        onEditBeatTypeChange={setEditBeatType}
        editEmotionalTone={editEmotionalTone}
        onEditEmotionalToneChange={setEditEmotionalTone}
        editSummary={editSummary}
        onEditSummaryChange={setEditSummary}
        onSave={handleEditSave}
        isPending={updateBeat.isPending}
      />
    </div>
  );
}

/* Components */

interface BeatCardProps {
  beat: {
    id: string;
    title: string;
    act: string;
    beatType: string | null;
    summary: string | null;
    emotionalTone: string | null;
    order: number;
  };
  actColor: string;
  onDelete: (id: string) => void;
  onEdit: (beat: {
    id: string;
    title: string;
    act: string;
    beatType: string | null;
    summary: string | null;
    emotionalTone: string | null;
  }) => void;
}

function BeatCard({ beat, actColor, onDelete, onEdit }: BeatCardProps) {
  const typeLabel =
    BEAT_TYPE_OPTIONS.find((o) => o.value === beat.beatType)?.label ?? beat.beatType;
  const toneLabel =
    EMOTIONAL_TONE_OPTIONS.find((o) => o.value === beat.emotionalTone)?.label ?? beat.emotionalTone;

  return (
    <Card className={actColor}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <GripVertical className="text-muted-foreground h-4 w-4 shrink-0" />
          <CardTitle className="text-sm font-medium">{beat.title}</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => onEdit(beat)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => onDelete(beat.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="flex flex-wrap gap-1">
          {beat.beatType ? (
            <Badge variant="outline" className="text-xs">
              {typeLabel}
            </Badge>
          ) : null}
          {beat.emotionalTone ? (
            <Badge variant="secondary" className="text-xs">
              {toneLabel}
            </Badge>
          ) : null}
        </div>
        {beat.summary ? (
          <p className="text-muted-foreground line-clamp-2 text-xs">{beat.summary}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TemplateInfo({ count }: { count: number }) {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      템플릿 {count}개
    </Badge>
  );
}

interface EditBeatDialogProps {
  editingBeat: {
    id: string;
    title: string;
    act: string;
    beatType: string | null;
    summary: string | null;
    emotionalTone: string | null;
  } | null;
  onOpenChange: (open: boolean) => void;
  editTitle: string;
  onEditTitleChange: (value: string) => void;
  editAct: string;
  onEditActChange: (value: string) => void;
  editBeatType: string;
  onEditBeatTypeChange: (value: string) => void;
  editEmotionalTone: string;
  onEditEmotionalToneChange: (value: string) => void;
  editSummary: string;
  onEditSummaryChange: (value: string) => void;
  onSave: () => void;
  isPending: boolean;
}

function EditBeatDialog({
  editingBeat,
  onOpenChange,
  editTitle,
  onEditTitleChange,
  editAct,
  onEditActChange,
  editBeatType,
  onEditBeatTypeChange,
  editEmotionalTone,
  onEditEmotionalToneChange,
  editSummary,
  onEditSummaryChange,
  onSave,
  isPending,
}: EditBeatDialogProps) {
  return (
    <Dialog open={!!editingBeat} onOpenChange={(open) => onOpenChange(open)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>비트 수정</DialogTitle>
          <DialogDescription>비트의 정보를 수정합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>제목</Label>
            <Input
              placeholder="비트 제목"
              value={editTitle}
              onChange={(e) => onEditTitleChange(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>막 (Act)</Label>
              <Select value={editAct} onValueChange={(val) => onEditActChange(val ?? "act_1")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>비트 타입</Label>
              <Select
                value={editBeatType}
                onValueChange={(val) => onEditBeatTypeChange(val ?? "custom")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BEAT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>감정 톤</Label>
            <Select
              value={editEmotionalTone}
              onValueChange={(val) => onEditEmotionalToneChange(val ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="선택 (옵션)" />
              </SelectTrigger>
              <SelectContent>
                {EMOTIONAL_TONE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>요약</Label>
            <Textarea
              placeholder="이 비트에서 일어나는 일을 설명하세요"
              value={editSummary}
              onChange={(e) => onEditSummaryChange(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={onSave} disabled={!editTitle.trim() || isPending}>
            {isPending ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BeatBoardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-6 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-32" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-24 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
