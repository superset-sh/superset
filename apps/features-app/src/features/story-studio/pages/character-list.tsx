/**
 * CharacterList - 캐릭터 목록 관리
 */
import { useState } from "react";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus, Trash2, User, Users } from "lucide-react";
import {
  useCharacters,
  useCreateCharacter,
  useDeleteCharacter,
  useUpdateCharacter,
} from "../hooks";

const ROLE_OPTIONS = [
  { value: "protagonist", label: "주인공" },
  { value: "antagonist", label: "적대자" },
  { value: "supporting", label: "조연" },
  { value: "npc", label: "NPC" },
  { value: "mob", label: "몹" },
];

export function CharacterList() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();
  const projectId = id ?? "";

  const { data: characters, isLoading } = useCharacters(projectId);
  const createCharacter = useCreateCharacter(projectId);
  const updateCharacter = useUpdateCharacter(projectId);
  const deleteCharacter = useDeleteCharacter(projectId);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState("supporting");
  const [personality, setPersonality] = useState("");
  const [speechStyle, setSpeechStyle] = useState("");

  const handleCreate = () => {
    if (!name.trim() || !code.trim()) return;
    createCharacter.mutate(
      {
        projectId,
        name: name.trim(),
        code: code.trim(),
        role,
        personality: personality.trim() || undefined,
        speechStyle: speechStyle.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          resetForm();
        },
      },
    );
  };

  const handleEditOpen = (char: {
    id: string;
    name: string;
    code: string;
    role: string | null;
    personality: string | null;
    speechStyle: string | null;
  }) => {
    setEditId(char.id);
    setName(char.name);
    setCode(char.code);
    setRole(char.role ?? "supporting");
    setPersonality(char.personality ?? "");
    setSpeechStyle(char.speechStyle ?? "");
    setEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editId || !name.trim() || !code.trim()) return;
    updateCharacter.mutate(
      {
        id: editId,
        data: {
          name: name.trim(),
          code: code.trim(),
          role,
          personality: personality.trim() || undefined,
          speechStyle: speechStyle.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setEditOpen(false);
          resetForm();
        },
      },
    );
  };

  const resetForm = () => {
    setName("");
    setCode("");
    setRole("supporting");
    setPersonality("");
    setSpeechStyle("");
    setEditId(null);
  };

  const handleDelete = (charId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("이 캐릭터를 삭제하시겠습니까?")) {
      deleteCharacter.mutate({ id: charId });
    }
  };

  if (isLoading) {
    return <CharacterSkeleton />;
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
          <h1 className="text-2xl font-bold">캐릭터 관리</h1>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1 h-4 w-4" />
            캐릭터 추가
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 캐릭터 추가</DialogTitle>
              <DialogDescription>등장인물의 기본 정보를 입력하세요.</DialogDescription>
            </DialogHeader>
            <CharacterForm
              name={name}
              code={code}
              role={role}
              personality={personality}
              speechStyle={speechStyle}
              onNameChange={setName}
              onCodeChange={setCode}
              onRoleChange={setRole}
              onPersonalityChange={setPersonality}
              onSpeechStyleChange={setSpeechStyle}
            />
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
                disabled={!name.trim() || !code.trim() || createCharacter.isPending}
              >
                {createCharacter.isPending ? "추가 중..." : "추가"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Character Grid */}
      {!characters || characters.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <Users className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
            <p className="text-muted-foreground">캐릭터가 없습니다</p>
            <p className="text-muted-foreground mt-1 text-sm">첫 번째 캐릭터를 추가해보세요.</p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              캐릭터 추가
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((char) => (
            <Card key={char.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-full">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{char.name}</CardTitle>
                      <CardDescription className="font-mono text-xs">{char.code}</CardDescription>
                    </div>
                  </div>
                  <RoleBadge role={char.role} />
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                {char.personality ? (
                  <p className="text-muted-foreground line-clamp-2 text-sm">{char.personality}</p>
                ) : (
                  <p className="text-muted-foreground text-sm italic">성격 설명 없음</p>
                )}
                {char.speechStyle ? (
                  <p className="text-muted-foreground/70 mt-1 text-xs">말투: {char.speechStyle}</p>
                ) : null}
              </CardContent>
              <CardFooter className="flex justify-end gap-1 pt-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleEditOpen(char)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => handleDelete(char.id, e)}
                >
                  <Trash2 className="text-muted-foreground h-3.5 w-3.5" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>캐릭터 편집</DialogTitle>
            <DialogDescription>캐릭터 정보를 수정합니다.</DialogDescription>
          </DialogHeader>
          <CharacterForm
            name={name}
            code={code}
            role={role}
            personality={personality}
            speechStyle={speechStyle}
            onNameChange={setName}
            onCodeChange={setCode}
            onRoleChange={setRole}
            onPersonalityChange={setPersonality}
            onSpeechStyleChange={setSpeechStyle}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditOpen(false);
                resetForm();
              }}
            >
              취소
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!name.trim() || !code.trim() || updateCharacter.isPending}
            >
              {updateCharacter.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* Components */

interface CharacterFormProps {
  name: string;
  code: string;
  role: string;
  personality: string;
  speechStyle: string;
  onNameChange: (v: string) => void;
  onCodeChange: (v: string) => void;
  onRoleChange: (v: string) => void;
  onPersonalityChange: (v: string) => void;
  onSpeechStyleChange: (v: string) => void;
}

function CharacterForm({
  name,
  code,
  role,
  personality,
  speechStyle,
  onNameChange,
  onCodeChange,
  onRoleChange,
  onPersonalityChange,
  onSpeechStyleChange,
}: CharacterFormProps) {
  return (
    <div className="space-y-4 py-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>이름</Label>
          <Input
            placeholder="예: 아리아"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>코드</Label>
          <Input
            placeholder="예: ARIA"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>역할</Label>
        <div className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={role === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => onRoleChange(opt.value)}
              type="button"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>성격</Label>
        <Textarea
          placeholder="이 캐릭터의 성격을 설명하세요"
          value={personality}
          onChange={(e) => onPersonalityChange(e.target.value)}
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label>말투</Label>
        <Input
          placeholder="예: 격식체, 사투리, 존댓말"
          value={speechStyle}
          onChange={(e) => onSpeechStyleChange(e.target.value)}
        />
      </div>
    </div>
  );
}

interface RoleBadgeProps {
  role: string | null;
}

function RoleBadge({ role }: RoleBadgeProps) {
  const colorMap: Record<string, string> = {
    protagonist: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    antagonist: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    supporting: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    npc: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    mob: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  };

  const labelMap: Record<string, string> = {
    protagonist: "주인공",
    antagonist: "적대자",
    supporting: "조연",
    npc: "NPC",
    mob: "몹",
  };

  const r = role ?? "npc";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        colorMap[r] ?? colorMap.npc,
      )}
    >
      {labelMap[r] ?? r}
    </span>
  );
}

function CharacterSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div>
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="mt-1 h-3 w-12" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
