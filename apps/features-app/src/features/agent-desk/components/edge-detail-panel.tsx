import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { ScrollArea } from "@superbuilder/feature-ui/shadcn/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { X, Pencil, Eye, Save, ArrowDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUpdateFlowEdge } from "../hooks";
import type { FlowEdge, FlowScreen } from "../types";

interface Props {
  sessionId: string;
  edge: FlowEdge;
  screens: FlowScreen[];
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

const TRANSITION_TYPES = [
  { value: "navigate", label: "Navigate" },
  { value: "redirect", label: "Redirect" },
  { value: "modal", label: "Modal" },
  { value: "conditional", label: "Conditional" },
] as const;

export function EdgeDetailPanel({ sessionId, edge, screens, onClose, onDirtyChange }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [conditionLabel, setConditionLabel] = useState(edge.conditionLabel);
  const [transitionType, setTransitionType] = useState(edge.transitionType);
  const updateEdge = useUpdateFlowEdge();

  const fromScreen = screens.find((s) => s.id === edge.fromScreenId);
  const toScreen = screens.find((s) => s.id === edge.toScreenId);

  const handleEdit = () => {
    setConditionLabel(edge.conditionLabel);
    setTransitionType(edge.transitionType);
    setIsEditing(true);
  };

  const handleView = () => {
    setIsEditing(false);
    onDirtyChange(false);
  };

  const handleSave = () => {
    updateEdge.mutate(
      { sessionId, edgeId: edge.id, conditionLabel, transitionType },
      {
        onSuccess: () => {
          setIsEditing(false);
          onDirtyChange(false);
          toast.success("저장되었습니다");
        },
        onError: () => {
          toast.error("저장에 실패했습니다");
        },
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 bg-muted/5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">전이 상세</h3>
          <Badge variant="outline" className="text-[10px]">
            {isEditing ? "편집" : "보기"}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Button variant="ghost" size="icon" className="size-7" onClick={handleView}>
                <Eye className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={handleSave}
                disabled={updateEdge.isPending}
              >
                {updateEdge.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="icon" className="size-7" onClick={handleEdit}>
              <Pencil className="size-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 flex flex-col gap-4">
          {/* From → To visualization */}
          <div className="flex flex-col items-center gap-2 rounded-lg border border-border/50 bg-muted/20 p-4">
            <div className="rounded-md border bg-background px-3 py-1.5 text-sm font-medium">
              {fromScreen?.name ?? "알 수 없음"}
            </div>
            <ArrowDown className="size-4 text-muted-foreground" />
            <div className="rounded-md border bg-background px-3 py-1.5 text-sm font-medium">
              {toScreen?.name ?? "알 수 없음"}
            </div>
          </div>

          {/* Condition Label */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">조건 라벨</span>
            {isEditing ? (
              <Input
                value={conditionLabel}
                onChange={(e) => {
                  setConditionLabel(e.target.value);
                  onDirtyChange(true);
                }}
                placeholder="전이 조건을 입력하세요"
                className="text-sm"
              />
            ) : (
              <p className="text-sm text-foreground">{edge.conditionLabel || "-"}</p>
            )}
          </div>

          {/* Transition Type */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">전이 유형</span>
            {isEditing ? (
              <Select
                value={transitionType}
                onValueChange={(v) => {
                  if (v) {
                    setTransitionType(v as FlowEdge["transitionType"]);
                    onDirtyChange(true);
                  }
                }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSITION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="secondary" className="w-fit text-xs">
                {edge.transitionType}
              </Badge>
            )}
          </div>

          {/* Source Requirements */}
          {edge.sourceRequirementIds.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">요구사항 출처</span>
              <div className="flex flex-wrap gap-1.5">
                {edge.sourceRequirementIds.map((id) => (
                  <Badge key={id} variant="outline" className="text-xs">
                    {id}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
