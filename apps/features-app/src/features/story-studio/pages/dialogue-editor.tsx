/**
 * DialogueEditor - 대사 편집기
 *
 * 노드별 대사 목록을 편집. 캐릭터/감정/유형 선택, 대사 입력, 순서 변경.
 */
import { useState } from "react";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent } from "@superbuilder/feature-ui/shadcn/card";
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
import { ArrowLeft, GripVertical, MessageSquarePlus, Trash2 } from "lucide-react";
import {
  useCharacters,
  useCreateDialogue,
  useDeleteDialogue,
  useDialoguesByNode,
  useUpdateDialogue,
} from "../hooks";

const EMOTION_OPTIONS = [
  { value: "neutral", label: "보통" },
  { value: "happy", label: "기쁨" },
  { value: "sad", label: "슬픔" },
  { value: "angry", label: "분노" },
  { value: "surprised", label: "놀람" },
  { value: "scared", label: "공포" },
  { value: "thoughtful", label: "사색" },
  { value: "confused", label: "혼란" },
  { value: "calm", label: "차분" },
  { value: "uncertain", label: "불안" },
];

const TYPE_OPTIONS = [
  { value: "dialogue", label: "대사" },
  { value: "narration", label: "나레이션" },
  { value: "monologue", label: "독백" },
  { value: "system", label: "시스템" },
  { value: "choice_text", label: "선택지 텍스트" },
  { value: "direction", label: "연출 지시" },
];

export function DialogueEditor() {
  const { id, chId, nodeId } = useParams({ strict: false });
  const navigate = useNavigate();
  const projectId = id ?? "";
  const chapterId = chId ?? "";
  const branchNodeId = nodeId ?? "";

  const { data: dialogues, isLoading: dialoguesLoading } = useDialoguesByNode(branchNodeId);
  const { data: characters } = useCharacters(projectId);
  const createDialogue = useCreateDialogue(branchNodeId);
  const updateDialogue = useUpdateDialogue(branchNodeId);
  const deleteDialogue = useDeleteDialogue(branchNodeId);

  const handleAddDialogue = () => {
    createDialogue.mutate({
      projectId,
      chapterId,
      branchNodeId,
      content: "",
      type: "dialogue",
    });
  };

  const handleDeleteDialogue = (dialogueId: string) => {
    if (window.confirm("이 대사를 삭제하시겠습니까?")) {
      deleteDialogue.mutate({ id: dialogueId });
    }
  };

  if (dialoguesLoading) {
    return <DialogueSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate({
                to: "/story-studio/$id/chapters/$chId/graph",
                params: { id: projectId, chId: chapterId },
              })
            }
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            그래프로 돌아가기
          </Button>
          <h1 className="text-2xl font-bold">대사 편집기</h1>
        </div>
        <Button onClick={handleAddDialogue} disabled={createDialogue.isPending}>
          <MessageSquarePlus className="mr-1 h-4 w-4" />
          대사 추가
        </Button>
      </div>

      {/* Dialogue Lines */}
      {!dialogues || dialogues.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <MessageSquarePlus className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
            <p className="text-muted-foreground">대사가 없습니다</p>
            <p className="text-muted-foreground mt-1 text-sm">첫 번째 대사를 추가해보세요.</p>
            <Button className="mt-4" onClick={handleAddDialogue}>
              대사 추가
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {dialogues.map((dialogue, idx) => (
            <DialogueLine
              key={dialogue.id}
              dialogue={dialogue}
              index={idx}
              characters={characters ?? []}
              onUpdate={(data) => updateDialogue.mutate({ id: dialogue.id, data })}
              onDelete={() => handleDeleteDialogue(dialogue.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* Components */

interface DialogueLineProps {
  dialogue: {
    id: string;
    content: string;
    type: string | null;
    speakerId: string | null;
    emotion: string | null;
    direction: string | null;
    stringId: string | null;
    order: number;
  };
  index: number;
  characters: Array<{ id: string; name: string; code: string }>;
  onUpdate: (data: Record<string, string | undefined>) => void;
  onDelete: () => void;
}

function DialogueLine({ dialogue, index, characters, onUpdate, onDelete }: DialogueLineProps) {
  const [content, setContent] = useState(dialogue.content);
  const [direction, setDirection] = useState(dialogue.direction ?? "");

  const handleContentBlur = () => {
    if (content !== dialogue.content) {
      onUpdate({ content });
    }
  };

  const handleDirectionBlur = () => {
    const trimmed = direction.trim();
    if (trimmed !== (dialogue.direction ?? "")) {
      onUpdate({ direction: trimmed || undefined });
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        {/* Top Row: Index + Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GripVertical className="text-muted-foreground h-4 w-4 cursor-grab" />
            <Badge variant="outline" className="text-xs">
              #{index + 1}
            </Badge>
            {dialogue.stringId ? (
              <Badge variant="secondary" className="font-mono text-xs">
                {dialogue.stringId}
              </Badge>
            ) : null}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
            <Trash2 className="text-muted-foreground h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Selectors Row */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">캐릭터</Label>
            <Select
              value={dialogue.speakerId ?? "none"}
              onValueChange={(val) =>
                onUpdate({ speakerId: val === "none" ? undefined : (val ?? undefined) })
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">없음</SelectItem>
                {characters.map((char) => (
                  <SelectItem key={char.id} value={char.id}>
                    {char.name} ({char.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">감정</Label>
            <Select
              value={dialogue.emotion ?? "neutral"}
              onValueChange={(val) => onUpdate({ emotion: val ?? undefined })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMOTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">유형</Label>
            <Select
              value={dialogue.type ?? "dialogue"}
              onValueChange={(val) => onUpdate({ type: val ?? undefined })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-1">
          <Label className="text-xs">대사 내용</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={handleContentBlur}
            rows={2}
            placeholder="대사를 입력하세요..."
            className="text-sm"
          />
        </div>

        {/* Direction (optional) */}
        <div className="space-y-1">
          <Label className="text-xs">연출 지시</Label>
          <Input
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            onBlur={handleDirectionBlur}
            placeholder="예: (조용히) 문을 열며"
            className="h-8 text-sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DialogueSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 pt-4">
            <Skeleton className="h-6 w-24" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
