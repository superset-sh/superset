import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { PenLine } from "lucide-react";
import type { AiImageFormat } from "@superbuilder/features-server/ai-image/types";

interface ContentTheme {
  id: string;
  name: string;
  description: string | null;
  promptTemplate: string;
  recommendedStyleIds: string[] | null;
  recommendedFormat: string | null;
}

interface Props {
  themes: ContentTheme[];
  selectedThemeId: string | null;
  themeVariables: Record<string, string>;
  onSelectTheme: (themeId: string | null) => void;
  onChangeVariables: (variables: Record<string, string>) => void;
  onFormatRecommended?: (format: AiImageFormat) => void;
  onStyleRecommended?: (styleIds: string[]) => void;
}

export function ContentThemeSelector({
  themes,
  selectedThemeId,
  themeVariables,
  onSelectTheme,
  onChangeVariables,
  onFormatRecommended,
  onStyleRecommended,
}: Props) {
  const selectedTheme = themes.find((t) => t.id === selectedThemeId);

  if (themes.length === 0) return null;

  const handleSelect = (theme: ContentTheme | null) => {
    if (!theme) {
      onSelectTheme(null);
      onChangeVariables({});
      return;
    }

    onSelectTheme(theme.id);
    onChangeVariables({});

    if (theme.recommendedFormat && onFormatRecommended) {
      onFormatRecommended(theme.recommendedFormat as AiImageFormat);
    }
    if (theme.recommendedStyleIds?.length && onStyleRecommended) {
      onStyleRecommended(theme.recommendedStyleIds);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="text-muted-foreground text-sm font-medium">콘텐츠 테마</label>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => handleSelect(null)}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center transition-colors",
            selectedThemeId === null
              ? "border-primary bg-primary/5 text-primary"
              : "border-border hover:border-primary/50",
          )}
        >
          <PenLine className="h-5 w-5" />
          <span className="text-xs font-medium">직접 입력</span>
        </button>

        {themes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            onClick={() => handleSelect(theme)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center transition-colors",
              selectedThemeId === theme.id
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-primary/50",
            )}
          >
            <span className="text-xs font-medium">{theme.name}</span>
            {theme.description ? (
              <span className="line-clamp-1 text-[10px] text-muted-foreground">
                {theme.description}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {selectedTheme ? (
        <ThemeVariableForm
          promptTemplate={selectedTheme.promptTemplate}
          variables={themeVariables}
          onChange={onChangeVariables}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface ThemeVariableFormProps {
  promptTemplate: string;
  variables: Record<string, string>;
  onChange: (variables: Record<string, string>) => void;
}

function ThemeVariableForm({ promptTemplate, variables, onChange }: ThemeVariableFormProps) {
  const requiredVars = extractVariables(promptTemplate);

  if (requiredVars.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <span className="text-xs font-medium text-muted-foreground">테마 변수 입력</span>
      {requiredVars.map((varName) => (
        <div key={varName} className="flex flex-col gap-1">
          <Label className="text-xs">{VARIABLE_LABELS[varName] ?? varName}</Label>
          <Input
            placeholder={`${VARIABLE_LABELS[varName] ?? varName}${getJosa(VARIABLE_LABELS[varName] ?? varName)} 입력하세요`}
            value={variables[varName] ?? ""}
            onChange={(e) => onChange({ ...variables, [varName]: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
      ))}
    </div>
  );
}

/* Helpers */

/** 받침 유무에 따라 "을/를" 조사 반환 */
function getJosa(word: string): string {
  const lastChar = word.charAt(word.length - 1);
  const code = lastChar.charCodeAt(0);
  // 한글 범위: 0xAC00 ~ 0xD7A3
  if (code < 0xac00 || code > 0xd7a3) return "을";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

/* Constants */

const VARIABLE_LABELS: Record<string, string> = {
  product: "제품명",
  message: "메시지",
  quote: "명언",
  author: "작가",
  scene: "장면",
  topic: "주제",
  news: "새소식",
  benefit: "혜택",
  discount: "할인 내용",
  step: "단계 설명",
  title: "제목",
  content: "내용",
};
