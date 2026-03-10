import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ComposerStepper } from "renderer/screens/atlas/components/ComposerStepper";
import { FeatureSelector } from "renderer/screens/atlas/components/FeatureSelector";
import { ResolutionPreview } from "renderer/screens/atlas/components/ResolutionPreview";
import { ProjectConfig } from "renderer/screens/atlas/components/ProjectConfig";
import {
  PipelineProgress,
  type PipelineStepStatus,
} from "renderer/screens/atlas/components/PipelineProgress";
import { useAtlasComposerStore } from "renderer/stores/atlas-state";
import { useState } from "react";

export const Route = createFileRoute(
  "/_authenticated/_dashboard/atlas/composer/",
)({
  component: ComposerPage,
});

interface PipelineState {
  active: boolean;
  steps: Array<{
    label: string;
    status: PipelineStepStatus;
    message?: string;
  }>;
  result: {
    projectId: string;
    targetPath: string;
    features: string[];
    gitInitialized: boolean;
  } | null;
}

const INITIAL_PIPELINE: PipelineState = {
  active: false,
  steps: [
    { label: "파일 추출", status: "pending" },
    { label: "Git 초기화", status: "pending" },
    { label: "Supabase 프로젝트", status: "pending" },
    { label: "Vercel 배포", status: "pending" },
  ],
  result: null,
};

function ComposerPage() {
  const {
    step,
    setStep,
    selectedFeatures,
    toggleFeature,
    projectName,
    setProjectName,
    targetPath,
    setTargetPath,
    reset,
  } = useAtlasComposerStore();

  const navigate = useNavigate();
  const [pipeline, setPipeline] = useState<PipelineState>(INITIAL_PIPELINE);

  const { data: registryData, isLoading: registryLoading } =
    electronTrpc.atlas.registry.getRegistry.useQuery();

  const { data: resolution } = electronTrpc.atlas.resolver.resolve.useQuery(
    { selected: selectedFeatures },
    { enabled: selectedFeatures.length > 0 },
  );

  const composeMutation = electronTrpc.atlas.composer.compose.useMutation();

  if (registryLoading || !registryData) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner className="size-5" />
      </div>
    );
  }

  const { registry } = registryData;
  const canProceedToStep1 = selectedFeatures.length > 0;
  const canCompose =
    projectName.trim() && targetPath.trim() && !!resolution;

  const updateStep = (index: number, status: PipelineStepStatus, message?: string) => {
    setPipeline((prev) => ({
      ...prev,
      steps: prev.steps.map((s, i) =>
        i === index ? { ...s, status, message } : s,
      ),
    }));
  };

  const handleCompose = async () => {
    if (!canCompose) return;

    setPipeline({ ...INITIAL_PIPELINE, active: true });
    setStep(3);

    // Step 0: Extract + Git (both handled by compose mutation)
    updateStep(0, "running", "프로젝트 파일을 추출하는 중...");

    try {
      const result = await composeMutation.mutateAsync({
        selected: selectedFeatures,
        projectName: projectName.trim(),
        targetPath: targetPath.trim(),
      });

      updateStep(0, "done", `${result.features.length}개 Feature 추출 완료`);
      updateStep(
        1,
        result.gitInitialized ? "done" : "failed",
        result.gitInitialized ? "Git 저장소 초기화 완료" : "Git 초기화 실패",
      );

      // Supabase & Vercel: not yet implemented
      updateStep(2, "skipped", "추후 연결 가능");
      updateStep(3, "skipped", "추후 배포 가능");

      setPipeline((prev) => ({
        ...prev,
        result: {
          projectId: result.projectId,
          targetPath: result.targetPath,
          features: result.features,
          gitInitialized: result.gitInitialized,
        },
      }));
    } catch (error) {
      updateStep(
        0,
        "failed",
        error instanceof Error ? error.message : "알 수 없는 오류",
      );
    }
  };

  // Pipeline active: show progress
  if (pipeline.active) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-lg font-semibold">프로젝트 생성 중</h1>
          <p className="text-sm text-muted-foreground">
            {projectName} 프로젝트를 구성하고 있습니다
          </p>
        </div>

        <ComposerStepper
          currentStep={3}
          completedSteps={pipeline.steps
            .map((s, i) => (s.status === "done" ? i + 3 : -1))
            .filter((i) => i >= 0)}
          failedSteps={pipeline.steps
            .map((s, i) => (s.status === "failed" ? i + 3 : -1))
            .filter((i) => i >= 0)}
          activeStep={
            pipeline.steps.findIndex((s) => s.status === "running") >= 0
              ? pipeline.steps.findIndex((s) => s.status === "running") + 3
              : null
          }
        />

        <PipelineProgress steps={pipeline.steps} />

        {pipeline.result ? (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-green-500">
                프로젝트 생성 완료!
              </h2>
            </div>
            <code className="block p-3 rounded bg-muted text-sm font-mono">
              {pipeline.result.targetPath}
            </code>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPipeline(INITIAL_PIPELINE);
                  reset();
                }}
              >
                새 프로젝트 만들기
              </Button>
              <Button
                onClick={() =>
                  navigate({ to: "/atlas/deployments" as string })
                }
              >
                배포 목록으로
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // Normal stepper flow (steps 0-2)
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Project Composer</h1>
        <p className="text-sm text-muted-foreground">
          Feature를 선택하고 새 프로젝트를 생성합니다
        </p>
      </div>

      <ComposerStepper currentStep={step} />

      {step === 0 ? (
        <div className="space-y-4">
          <FeatureSelector
            registry={registry}
            selected={selectedFeatures}
            onToggle={toggleFeature}
          />
          <div className="flex justify-end">
            <Button
              onClick={() => setStep(1)}
              disabled={!canProceedToStep1}
            >
              다음: 의존성 확인
            </Button>
          </div>
        </div>
      ) : null}

      {step === 1 && resolution ? (
        <div className="space-y-4">
          <ResolutionPreview resolution={resolution} />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(0)}>
              이전
            </Button>
            <Button onClick={() => setStep(2)}>다음: 프로젝트 설정</Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <ProjectConfig
            projectName={projectName}
            onProjectNameChange={setProjectName}
            targetPath={targetPath}
            onTargetPathChange={setTargetPath}
          />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              이전
            </Button>
            <Button onClick={handleCompose} disabled={!canCompose}>
              프로젝트 생성
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
