import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ComposerStepper } from "renderer/screens/atlas/components/ComposerStepper";
import { FeatureSelector } from "renderer/screens/atlas/components/FeatureSelector";
import { ResolutionPreview } from "renderer/screens/atlas/components/ResolutionPreview";
import { ProjectConfig } from "renderer/screens/atlas/components/ProjectConfig";
import { useAtlasComposerStore } from "renderer/stores/atlas-state";
import { useState } from "react";

export const Route = createFileRoute(
  "/_authenticated/_dashboard/atlas/composer/",
)({
  component: ComposerPage,
});

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

  const [composing, setComposing] = useState(false);
  const [result, setResult] = useState<{
    targetPath: string;
    features: string[];
  } | null>(null);

  const { data: registryData, isLoading: registryLoading } =
    electronTrpc.atlas.registry.getRegistry.useQuery();

  const { data: resolution } = electronTrpc.atlas.resolver.resolve.useQuery(
    { selected: selectedFeatures },
    { enabled: selectedFeatures.length > 0 },
  );

  const composeMutation = electronTrpc.atlas.composer.compose.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setComposing(false);
    },
    onError: () => setComposing(false),
  });

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

  const handleCompose = () => {
    if (!canCompose) return;
    setComposing(true);
    composeMutation.mutate({
      selected: selectedFeatures,
      projectName: projectName.trim(),
      targetPath: targetPath.trim(),
    });
  };

  if (result) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-lg font-semibold text-green-500">
          프로젝트 생성 완료!
        </h1>
        <p className="text-sm text-muted-foreground">
          {result.features.length}개 Feature가 포함된 프로젝트가 생성되었습니다.
        </p>
        <code className="block p-3 rounded bg-muted text-sm font-mono">
          {result.targetPath}
        </code>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setResult(null);
              reset();
            }}
          >
            새 프로젝트 만들기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Project Composer</h1>
        <p className="text-sm text-muted-foreground">
          Feature를 선택하고 새 프로젝트를 생성합니다
        </p>
      </div>

      <ComposerStepper currentStep={step} />

      {step === 0 && (
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
      )}

      {step === 1 && resolution && (
        <div className="space-y-4">
          <ResolutionPreview resolution={resolution} />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(0)}>
              이전
            </Button>
            <Button onClick={() => setStep(2)}>다음: 프로젝트 설정</Button>
          </div>
        </div>
      )}

      {step === 2 && (
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
            <Button onClick={handleCompose} disabled={!canCompose || composing}>
              {composing ? <Spinner className="size-4 mr-2" /> : null}
              프로젝트 생성
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
