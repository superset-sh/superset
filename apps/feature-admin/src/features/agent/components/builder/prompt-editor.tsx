import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Label } from "@superbuilder/feature-ui/shadcn/label";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function PromptEditor({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor="system-prompt">시스템 프롬프트</Label>
      <Textarea
        id="system-prompt"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="에이전트의 역할과 행동 방식을 정의합니다..."
        className="min-h-[200px] font-mono text-sm"
      />
      <p className="text-sm text-muted-foreground">
        에이전트가 대화에서 따라야 할 지침을 작성합니다.
      </p>
    </div>
  );
}
