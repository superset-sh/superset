/**
 * EffectEditor - 플래그 효과 목록 편집기
 *
 * 엣지 통과 시 실행되는 플래그 변경 효과를 편집
 */
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Minus, Plus } from "lucide-react";

interface Flag {
  id: string;
  name: string;
  category: string;
}

interface Effect {
  flagId: string;
  operation: "set" | "add" | "subtract" | "toggle" | "multiply";
  value: string | number | boolean;
}

interface EffectEditorProps {
  effects: Effect[];
  flags: Flag[];
  onChange: (effects: Effect[]) => void;
}

const OPERATIONS = [
  { value: "set", label: "설정 (=)" },
  { value: "add", label: "더하기 (+)" },
  { value: "subtract", label: "빼기 (−)" },
  { value: "toggle", label: "토글 (!)" },
  { value: "multiply", label: "곱하기 (×)" },
] as const;

export function EffectEditor({ effects, flags, onChange }: EffectEditorProps) {
  const handleAdd = () => {
    onChange([...effects, { flagId: "", operation: "set", value: "" }]);
  };

  const handleUpdate = (index: number, updated: Effect) => {
    onChange(effects.map((e, i) => (i === index ? updated : e)));
  };

  const handleRemove = (index: number) => {
    onChange(effects.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {effects.map((effect, index) => (
        <EffectRow
          key={index}
          effect={effect}
          flags={flags}
          onChange={(updated) => handleUpdate(index, updated)}
          onRemove={() => handleRemove(index)}
        />
      ))}
      <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
        <Plus className="mr-1 h-3 w-3" />
        효과 추가
      </Button>
    </div>
  );
}

/* Components */

interface EffectRowProps {
  effect: Effect;
  flags: Flag[];
  onChange: (updated: Effect) => void;
  onRemove: () => void;
}

function EffectRow({ effect, flags, onChange, onRemove }: EffectRowProps) {
  return (
    <div className="flex items-center gap-1.5">
      {/* Flag selector */}
      <Select
        value={effect.flagId}
        onValueChange={(val) => onChange({ ...effect, flagId: val ?? "" })}
      >
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue placeholder="플래그 선택" />
        </SelectTrigger>
        <SelectContent>
          {flags.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operation */}
      <Select
        value={effect.operation}
        onValueChange={(val) => onChange({ ...effect, operation: val as Effect["operation"] })}
      >
        <SelectTrigger className="h-8 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATIONS.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value */}
      <Input
        className="h-8 w-24 text-xs"
        value={String(effect.value ?? "")}
        onChange={(e) => onChange({ ...effect, value: parseEffectValue(e.target.value) })}
        placeholder="값"
      />

      {/* Remove */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onRemove}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/* Helpers */

function parseEffectValue(raw: string): string | number | boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim() !== "") return num;
  return raw;
}
