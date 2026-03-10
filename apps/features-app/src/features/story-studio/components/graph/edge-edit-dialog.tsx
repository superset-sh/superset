/**
 * EdgeEditDialog - 엣지 조건/효과 편집 다이얼로그
 *
 * 그래프 캔버스에서 엣지 클릭 시 열리며, 레이블/조건/효과를 편집
 */
import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { ConditionBuilder } from "./condition-builder";
import { EffectEditor } from "./effect-editor";

interface Flag {
  id: string;
  name: string;
  category: string;
}

interface Condition {
  type: "flag_check" | "group";
  flagId?: string;
  operator?: "==" | "!=" | ">" | ">=" | "<" | "<=";
  value?: string | number | boolean;
  logic?: "AND" | "OR";
  children?: Condition[];
}

interface Effect {
  flagId: string;
  operation: "set" | "add" | "subtract" | "toggle" | "multiply";
  value: string | number | boolean;
}

interface EdgeData {
  id: string;
  label?: string;
  conditions: Condition[];
  effects: Effect[];
}

interface EdgeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edge: EdgeData | null;
  flags: Flag[];
  onSave: (
    id: string,
    data: { label?: string; conditions: Condition[]; effects: Effect[] },
  ) => void;
  isPending?: boolean;
}

export function EdgeEditDialog({
  open,
  onOpenChange,
  edge,
  flags,
  onSave,
  isPending,
}: EdgeEditDialogProps) {
  const [label, setLabel] = useState("");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [effects, setEffects] = useState<Effect[]>([]);

  // Reset form when edge changes
  const [prevEdgeId, setPrevEdgeId] = useState<string | null>(null);
  if (edge && edge.id !== prevEdgeId) {
    setPrevEdgeId(edge.id);
    setLabel(edge.label ?? "");
    setConditions(edge.conditions ?? []);
    setEffects(edge.effects ?? []);
  }

  const handleSave = () => {
    if (!edge) return;
    onSave(edge.id, {
      label: label || undefined,
      conditions,
      effects,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>엣지 편집</DialogTitle>
          <DialogDescription>분기 조건과 플래그 변경 효과를 설정합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Label */}
          <div className="space-y-2">
            <Label htmlFor="edge-label">레이블</Label>
            <Input
              id="edge-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="선택지 텍스트 또는 분기 이름"
            />
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            <Label>조건 (Conditions)</Label>
            <p className="text-muted-foreground text-xs">이 경로를 따르려면 만족해야 하는 조건들</p>
            <ConditionBuilder conditions={conditions} flags={flags} onChange={setConditions} />
          </div>

          {/* Effects */}
          <div className="space-y-2">
            <Label>효과 (Effects)</Label>
            <p className="text-muted-foreground text-xs">
              이 경로를 통과할 때 실행되는 플래그 변경
            </p>
            <EffectEditor effects={effects} flags={flags} onChange={setEffects} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
