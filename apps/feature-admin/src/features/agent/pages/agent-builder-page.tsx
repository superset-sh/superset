import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Slider } from "@superbuilder/feature-ui/shadcn/slider";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Spinner } from "@superbuilder/feature-ui/shadcn/spinner";
import { toast } from "sonner";
import { PromptEditor } from "../components/builder/prompt-editor";
import { ModelSelector } from "../components/builder/model-selector";
import { ToolPicker } from "../components/builder/tool-picker";
import { useAgent, useAgentMutations } from "../hooks/use-agents";

interface Props {
  agentId?: string;
}

export function AgentBuilderPage({ agentId }: Props) {
  const navigate = useNavigate();
  const { data: agent, isLoading } = useAgent(agentId);
  const { create, update } = useAgentMutations();

  const isEdit = !!agentId;

  const [form, setForm] = useState<FormState>({
    name: "",
    slug: "",
    description: "",
    avatar: "",
    systemPrompt: "",
    modelPreference: {},
    enabledTools: [] as string[],
    temperature: 0.7,
    maxSteps: 10,
    isDefault: false,
  });

  // 수정 모드: 에이전트 데이터 로드 시 폼 초기화
  const [initialized, setInitialized] = useState(false);
  if (isEdit && agent && !initialized) {
    setForm({
      name: agent.name,
      slug: agent.slug,
      description: agent.description ?? "",
      avatar: agent.avatar ?? "",
      systemPrompt: agent.systemPrompt,
      modelPreference: (agent.modelPreference as Record<string, string>) ?? {},
      enabledTools: agent.enabledTools ?? [],
      temperature: agent.temperature,
      maxSteps: agent.maxSteps,
      isDefault: agent.isDefault,
    });
    setInitialized(true);
  }

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSubmit = async () => {
    if (!form.name || !form.slug || !form.systemPrompt) {
      toast.error("이름, 슬러그, 시스템 프롬프트는 필수입니다.");
      return;
    }

    try {
      if (isEdit && agentId) {
        await update.mutateAsync({ id: agentId, data: form });
        toast.success("에이전트가 수정되었습니다.");
      } else {
        await create.mutateAsync(form);
        toast.success("에이전트가 생성되었습니다.");
      }
      navigate({ to: "/agent" });
    } catch (err) {
      toast.error(
        `에이전트 ${isEdit ? "수정" : "생성"} 실패: ${(err as Error).message}`,
      );
    }
  };

  if (isEdit && isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      </div>
    );
  }

  const isPending = create.isPending || update.isPending;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {isEdit ? "에이전트 수정" : "에이전트 생성"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI 에이전트의 프롬프트, 모델, 도구를 설정합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/agent" })}
          >
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "저장 중..." : isEdit ? "수정" : "생성"}
          </Button>
        </div>
      </div>
      <div className="mx-auto max-w-2xl space-y-8">
          {/* 기본 정보 */}
          <section className="space-y-4">
            <h2 className="text-lg font-medium">기본 정보</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="Atlas AI"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">슬러그</Label>
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => updateField("slug", e.target.value)}
                  placeholder="atlas-ai"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">설명</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="에이전트 설명 (선택)"
              />
            </div>
          </section>

          <Separator />

          {/* 시스템 프롬프트 */}
          <section>
            <PromptEditor
              value={form.systemPrompt}
              onChange={(v) => updateField("systemPrompt", v)}
            />
          </section>

          <Separator />

          {/* 모델 설정 */}
          <section>
            <ModelSelector
              value={form.modelPreference}
              onChange={(v) => updateField("modelPreference", v)}
            />
          </section>

          <Separator />

          {/* 파라미터 */}
          <section className="space-y-4">
            <h2 className="text-lg font-medium">파라미터</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Temperature</Label>
                  <span className="text-sm text-muted-foreground">
                    {form.temperature}
                  </span>
                </div>
                <Slider
                  value={[form.temperature]}
                  onValueChange={(v) => {
                    const val = Array.isArray(v) ? v[0] : v;
                    updateField("temperature", val);
                  }}
                  min={0}
                  max={2}
                  step={0.1}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxSteps">Max Steps (도구 호출 최대 횟수)</Label>
                <Input
                  id="maxSteps"
                  type="number"
                  value={form.maxSteps}
                  onChange={(e) =>
                    updateField("maxSteps", Number(e.target.value))
                  }
                  min={1}
                  max={50}
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* 도구 선택 */}
          <section>
            <ToolPicker
              value={form.enabledTools}
              onChange={(v) => updateField("enabledTools", v)}
            />
          </section>
        </div>
      </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

type FormState = {
  name: string;
  slug: string;
  description: string;
  avatar: string;
  systemPrompt: string;
  modelPreference: Record<string, string | undefined>;
  enabledTools: string[];
  temperature: number;
  maxSteps: number;
  isDefault: boolean;
};
