/**
 * EventList - 이벤트/트리거 관리
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { EffectEditor } from "../components/graph/effect-editor";
import { useCreateEvent, useDeleteEvent, useEvents, useFlags, useUpdateEvent } from "../hooks";

const EVENT_TYPE_OPTIONS = [
  { value: "item_acquire", label: "아이템 획득" },
  { value: "location_visit", label: "장소 방문" },
  { value: "battle_result", label: "전투 결과" },
  { value: "npc_talk", label: "NPC 대화" },
  { value: "quest_complete", label: "퀘스트 완료" },
  { value: "custom", label: "커스텀" },
];

const EVENT_TYPE_TABS = [
  { value: "all", label: "전체" },
  { value: "item_acquire", label: "아이템" },
  { value: "battle_result", label: "전투" },
  { value: "npc_talk", label: "대화" },
  { value: "quest_complete", label: "퀘스트" },
  { value: "custom", label: "커스텀" },
];

const TYPE_ICON_COLORS: Record<string, string> = {
  item_acquire: "text-amber-500",
  location_visit: "text-green-500",
  battle_result: "text-red-500",
  npc_talk: "text-blue-500",
  quest_complete: "text-purple-500",
  custom: "text-gray-500",
};

export function EventList() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();
  const projectId = id ?? "";

  const { data: events, isLoading } = useEvents(projectId);
  const { data: flags } = useFlags(projectId);
  const createEvent = useCreateEvent(projectId);
  const updateEvent = useUpdateEvent(projectId);
  const deleteEvent = useDeleteEvent(projectId);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventCardProps["event"] | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [name, setName] = useState("");
  const [type, setType] = useState("custom");
  const [description, setDescription] = useState("");

  const filteredEvents = activeTab === "all" ? events : events?.filter((e) => e.type === activeTab);

  const handleCreate = () => {
    if (!name.trim()) return;
    createEvent.mutate(
      {
        projectId,
        name: name.trim(),
        type,
        description: description.trim() || undefined,
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
    setName("");
    setType("custom");
    setDescription("");
  };

  const handleDelete = (eventId: string) => {
    if (window.confirm("이 이벤트를 삭제하시겠습니까?")) {
      deleteEvent.mutate({ id: eventId });
    }
  };

  if (isLoading) {
    return <EventSkeleton />;
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
          <h1 className="text-2xl font-bold">이벤트 관리</h1>
          <Badge variant="outline">{events?.length ?? 0}개</Badge>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1 h-4 w-4" />
            이벤트 추가
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 이벤트 추가</DialogTitle>
              <DialogDescription>
                게임에서 발생하는 이벤트를 정의합니다. 효과와 트리거 노드는 생성 후 편집할 수
                있습니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>이벤트 이름</Label>
                <Input
                  placeholder="예: first_boss_defeated"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>이벤트 유형</Label>
                <Select value={type} onValueChange={(val) => setType(val ?? "custom")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>설명</Label>
                <Textarea
                  placeholder="이 이벤트가 발생하는 상황과 결과를 설명하세요"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
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
              <Button onClick={handleCreate} disabled={!name.trim() || createEvent.isPending}>
                {createEvent.isPending ? "추가 중..." : "추가"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Type Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {EVENT_TYPE_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {!filteredEvents || filteredEvents.length === 0 ? (
            <Card className="py-12 text-center">
              <CardContent>
                <Zap className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
                <p className="text-muted-foreground">
                  {activeTab === "all"
                    ? "이벤트가 없습니다"
                    : `${EVENT_TYPE_TABS.find((t) => t.value === activeTab)?.label ?? ""} 유형 이벤트가 없습니다`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onDelete={handleDelete}
                  onEdit={setEditingEvent}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <EditEventDialog
        event={editingEvent}
        flags={flags ?? []}
        isPending={updateEvent.isPending}
        onClose={() => setEditingEvent(null)}
        onSave={(data) => {
          if (!editingEvent) return;
          updateEvent.mutate(
            { id: editingEvent.id, data },
            { onSuccess: () => setEditingEvent(null) },
          );
        }}
      />
    </div>
  );
}

/* Components */

interface EventCardProps {
  event: {
    id: string;
    name: string;
    type: string | null;
    description: string | null;
    effects: unknown[] | null;
    triggeredNodes: string[] | null;
  };
  onDelete: (id: string) => void;
  onEdit: (event: EventCardProps["event"]) => void;
}

function EventCard({ event, onDelete, onEdit }: EventCardProps) {
  const typeLabel =
    EVENT_TYPE_OPTIONS.find((o) => o.value === event.type)?.label ?? event.type ?? "미지정";
  const iconColor = TYPE_ICON_COLORS[event.type ?? "custom"] ?? TYPE_ICON_COLORS.custom;
  const effectCount = event.effects?.length ?? 0;
  const triggerCount = event.triggeredNodes?.length ?? 0;

  return (
    <Card className="transition-colors hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Zap className={cn("h-4 w-4 shrink-0", iconColor)} />
          <CardTitle className="text-sm font-medium">{event.name}</CardTitle>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => onEdit(event)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => onDelete(event.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-xs">
            {typeLabel}
          </Badge>
          {effectCount > 0 ? (
            <Badge variant="secondary" className="text-xs">
              효과 {effectCount}개
            </Badge>
          ) : null}
          {triggerCount > 0 ? (
            <Badge variant="secondary" className="text-xs">
              트리거 {triggerCount}개
            </Badge>
          ) : null}
        </div>
        {event.description ? (
          <p className="text-muted-foreground line-clamp-2 text-xs">{event.description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface EditEventDialogProps {
  event: EventCardProps["event"] | null;
  flags: { id: string; name: string; category: string }[];
  isPending: boolean;
  onClose: () => void;
  onSave: (data: {
    name?: string;
    type?: string;
    description?: string;
    effects?: {
      flagId: string;
      operation: "set" | "add" | "subtract" | "toggle" | "multiply";
      value: string | number | boolean;
    }[];
    triggeredNodes?: string[];
  }) => void;
}

function EditEventDialog({ event, flags, isPending, onClose, onSave }: EditEventDialogProps) {
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("custom");
  const [editDescription, setEditDescription] = useState("");
  const [editEffects, setEditEffects] = useState<
    {
      flagId: string;
      operation: "set" | "add" | "subtract" | "toggle" | "multiply";
      value: string | number | boolean;
    }[]
  >([]);
  const [editTriggeredNodes, setEditTriggeredNodes] = useState("");

  // Sync form state when event changes (new event selected for editing)
  const [prevEventId, setPrevEventId] = useState<string | null>(null);
  if (event && event.id !== prevEventId) {
    setPrevEventId(event.id);
    setEditName(event.name);
    setEditType(event.type ?? "custom");
    setEditDescription(event.description ?? "");
    setEditEffects(
      Array.isArray(event.effects)
        ? (event.effects as {
            flagId: string;
            operation: "set" | "add" | "subtract" | "toggle" | "multiply";
            value: string | number | boolean;
          }[])
        : [],
    );
    setEditTriggeredNodes(
      Array.isArray(event.triggeredNodes) ? event.triggeredNodes.join(", ") : "",
    );
  }
  if (!event && prevEventId !== null) {
    setPrevEventId(null);
  }

  const handleSave = () => {
    if (!editName.trim()) return;
    const triggeredNodesArray = editTriggeredNodes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onSave({
      name: editName.trim(),
      type: editType,
      description: editDescription.trim() || undefined,
      effects: editEffects,
      triggeredNodes: triggeredNodesArray.length > 0 ? triggeredNodesArray : undefined,
    });
  };

  return (
    <Dialog open={!!event} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>이벤트 편집</DialogTitle>
          <DialogDescription>이벤트의 속성, 효과, 트리거 노드를 수정합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>이벤트 이름</Label>
            <Input
              placeholder="예: first_boss_defeated"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>이벤트 유형</Label>
            <Select value={editType} onValueChange={(val) => setEditType(val ?? "custom")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>설명</Label>
            <Textarea
              placeholder="이 이벤트가 발생하는 상황과 결과를 설명하세요"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>효과 (플래그 변경)</Label>
            <EffectEditor effects={editEffects} flags={flags} onChange={setEditEffects} />
          </div>
          <div className="space-y-2">
            <Label>트리거 노드 (쉼표로 구분된 UUID)</Label>
            <Textarea
              placeholder="예: 550e8400-e29b-41d4-a716-446655440000, ..."
              value={editTriggeredNodes}
              onChange={(e) => setEditTriggeredNodes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={!editName.trim() || isPending}>
            {isPending ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-10 w-96" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    </div>
  );
}
