import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Label } from "@superbuilder/feature-ui/shadcn/label";

interface Props {
  value: ModelPreference;
  onChange: (value: ModelPreference) => void;
}

export function ModelSelector({ value, onChange }: Props) {
  const handleChange = (key: keyof ModelPreference, modelId: string) => {
    onChange({ ...value, [key]: modelId });
  };

  return (
    <div className="space-y-4">
      <Label>모델 설정</Label>
      <div className="grid grid-cols-2 gap-4">
        {MODEL_SLOTS.map((slot) => (
          <div key={slot.key} className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">
              {slot.label}
            </Label>
            <Select
              value={value[slot.key] ?? undefined}
              onValueChange={(v) => handleChange(slot.key, v as string)}
            >
              <SelectTrigger>
                <SelectValue placeholder="기본값 사용" />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_MODELS.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{slot.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

type ModelPreference = {
  fast?: string;
  default?: string;
  reasoning?: string;
  longContext?: string;
};

const MODEL_SLOTS: {
  key: keyof ModelPreference;
  label: string;
  description: string;
}[] = [
  { key: "fast", label: "Fast", description: "간단한 질문, 분류 등" },
  { key: "default", label: "Default", description: "일반 대화, 분석" },
  {
    key: "reasoning",
    label: "Reasoning",
    description: "복잡한 추론, 코드 생성",
  },
  {
    key: "longContext",
    label: "Long Context",
    description: "긴 문서 처리",
  },
];

const AVAILABLE_MODELS = [
  { id: "atlas:fast", label: "Atlas Fast (GPT-4o Mini)" },
  { id: "atlas:default", label: "Atlas Default (Claude Sonnet)" },
  { id: "atlas:reasoning", label: "Atlas Reasoning (Claude Opus)" },
  { id: "atlas:long", label: "Atlas Long (Gemini Pro)" },
  { id: "anthropic:claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { id: "anthropic:claude-opus-4-20250514", label: "Claude Opus 4" },
  { id: "openai:gpt-4o", label: "GPT-4o" },
  { id: "openai:gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "google:gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { id: "google:gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro" },
];
