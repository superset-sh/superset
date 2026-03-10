import { useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";
import { MessageResponse } from "@superbuilder/feature-ui/ai/message";
import { lastTokenUsageAtom, showTokenUsageAtom } from "../store/agent-settings.atoms";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@superbuilder/feature-ui/ai/reasoning";
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanContent,
  PlanFooter,
  PlanAction,
  PlanTrigger,
} from "@superbuilder/feature-ui/ai/plan";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { MermaidDiagram } from "@superbuilder/feature-ui/components/mermaid-diagram";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileCode2,
  GitBranch,
  Layout,
  Loader2,
  PackageCheck,
  PackagePlus,
  Play,
  RotateCcw,
  Square,
  Terminal,
} from "lucide-react";
import { useDiagrams, useGenerateFromAnalysis } from "../hooks";
import type { AnalysisFeature, AnalysisResult, DiagramResult, ExecutionEvent, FlowScreen } from "../types";
import { ExecutionLog } from "./execution-log";

interface Props {
  sessionId: string;
  sessionType: "customer" | "operator";
  status: string;
  analysisResult: AnalysisResult | null;
  spec: string | null;
  executionEvents: ExecutionEvent[];
  executionResult: { prUrl?: string; prNumber?: number } | null;
  executionError: string | null;
  isAnalyzing: boolean;
  isGeneratingSpec: boolean;
  isExecuting: boolean;
  onGenerateSpec: () => void;
  onExecute: () => void;
  onOpenTerminal: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDesignScreens?: () => Promise<void>;
  onOpenDesigner?: () => void;
  hasFlowData?: boolean;
  flowScreens?: FlowScreen[];
  // Streaming data
  streamingAnalysisText?: string;
  analysisStage?: string | null;
  analysisStageMessage?: string | null;
  streamingSpecText?: string;
  specStage?: string | null;
  specStageMessage?: string | null;
  screenGenStage?: string | null;
  screenGenStageMessage?: string | null;
  streamingScreenText?: string;
}

type ScreenGenState = "idle" | "generating" | "failed";

export function PipelinePanel({
  sessionId,
  sessionType,
  status,
  analysisResult,
  spec,
  executionEvents,
  executionResult,
  executionError,
  isAnalyzing,
  isGeneratingSpec,
  isExecuting,
  onGenerateSpec,
  onExecute,
  onOpenTerminal,
  onCancel,
  onRetry,
  onDesignScreens,
  onOpenDesigner,
  hasFlowData,
  flowScreens,
  streamingAnalysisText,
  analysisStage,
  analysisStageMessage,
  streamingSpecText,
  specStage,
  specStageMessage,
  screenGenStage,
  screenGenStageMessage,
  streamingScreenText,
}: Props) {
  const { t } = useFeatureTranslation("agent-desk");
  const showTokens = useAtomValue(showTokenUsageAtom);
  const lastUsage = useAtomValue(lastTokenUsageAtom);
  const [screenGenState, setScreenGenState] = useState<ScreenGenState>("idle");

  const handleDesignScreens = async () => {
    if (!onDesignScreens) return;
    setScreenGenState("generating");
    try {
      await onDesignScreens();
      // 성공 시 navigate가 unmount하지만, 안전망으로 idle 설정
      setScreenGenState("idle");
    } catch {
      setScreenGenState("failed");
    }
  };

  /* ---- Analyzing state (Task 5: Reasoning component) ---- */
  if (status === "analyzing" && !isAnalyzing) {
    // 세션이 "analyzing" 상태이지만 뮤테이션이 실행 중이 아닌 경우 (이전 시도가 갇힌 상태)
    return (
      <PanelContainer>
        <div className="flex items-center gap-2">
          <AlertCircle className="text-destructive size-5" />
          <p className="font-medium">{t("pipelineAnalyzingStuck")}</p>
        </div>
        <p className="text-muted-foreground mt-2 text-sm">{t("pipelineAnalyzingStuckDesc")}</p>
        <Button variant="outline" className="mt-3" onClick={onRetry}>
          <RotateCcw className="mr-2 size-4" />
          {t("pipelineRetry")}
        </Button>
      </PanelContainer>
    );
  }
  if (isAnalyzing) {
    return (
      <PanelContainer>
        <Reasoning isStreaming defaultOpen>
          <ReasoningTrigger
            getThinkingMessage={(streaming: boolean) =>
              streaming ? (analysisStageMessage ?? t("pipelineAnalyzing")) : t("pipelineAnalyzed")
            }
          />
          <ReasoningContent>
            {streamingAnalysisText || analysisStageMessage || t("pipelineAnalyzingDesc")}
          </ReasoningContent>
        </Reasoning>
        {analysisStage ? (
          <StreamingProgress
            stage={analysisStage}
            stageMessage={analysisStageMessage}
            onCancel={onCancel}
          />
        ) : (
          <ProgressSteps
            steps={[
              t("pipelineAnalyzingStep1"),
              t("pipelineAnalyzingStep2"),
              t("pipelineAnalyzingStep3"),
              t("pipelineAnalyzingStep4"),
              t("pipelineAnalyzingStep5"),
            ]}
            stepIntervalMs={8000}
            timeoutSec={90}
            onCancel={onCancel}
          />
        )}
      </PanelContainer>
    );
  }

  /* ---- Generating screens state (local) ---- */
  if (screenGenState === "generating") {
    return (
      <PanelContainer>
        <Reasoning isStreaming defaultOpen>
          <ReasoningTrigger
            getThinkingMessage={(streaming: boolean) =>
              streaming ? (screenGenStageMessage ?? t("pipelineDesigningScreens")) : t("screensGenerated")
            }
          />
          <ReasoningContent>
            {streamingScreenText || screenGenStageMessage || t("pipelineDesigningScreensDesc")}
          </ReasoningContent>
        </Reasoning>
        {screenGenStage ? (
          <StreamingProgress
            stage={screenGenStage}
            stageMessage={screenGenStageMessage}
            onCancel={() => setScreenGenState("idle")}
          />
        ) : (
          <ProgressSteps
            steps={[
              t("pipelineDesigningScreensStep1"),
              t("pipelineDesigningScreensStep2"),
              t("pipelineDesigningScreensStep3"),
              t("pipelineDesigningScreensStep4"),
            ]}
            stepIntervalMs={12000}
            timeoutSec={180}
            onCancel={() => setScreenGenState("idle")}
          />
        )}
      </PanelContainer>
    );
  }

  /* ---- Screen generation failed (local) ---- */
  if (screenGenState === "failed") {
    return (
      <PanelContainer>
        <div className="flex items-center gap-2">
          <AlertCircle className="text-destructive size-5" />
          <p className="font-medium">{t("pipelineDesignScreensFailed")}</p>
        </div>
        <p className="text-muted-foreground mt-2 text-sm">{t("pipelineDesignScreensFailedDesc")}</p>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" onClick={handleDesignScreens}>
            <RotateCcw className="mr-2 size-4" />
            {t("pipelineRetry")}
          </Button>
          <Button variant="ghost" onClick={() => setScreenGenState("idle")}>
            {t("pipelineCancel")}
          </Button>
        </div>
      </PanelContainer>
    );
  }

  /* ---- Generating spec state ---- */
  if (isGeneratingSpec) {
    return (
      <PanelContainer>
        <Reasoning isStreaming defaultOpen>
          <ReasoningTrigger
            getThinkingMessage={(streaming: boolean) =>
              streaming ? (specStageMessage ?? t("pipelineGeneratingSpec")) : t("pipelineGeneratingSpec")
            }
          />
          <ReasoningContent>
            {streamingSpecText || specStageMessage || t("pipelineGeneratingSpecDesc")}
          </ReasoningContent>
        </Reasoning>
        {specStage ? (
          <StreamingProgress
            stage={specStage}
            stageMessage={specStageMessage}
            onCancel={onCancel}
          />
        ) : (
          <ProgressSteps
            steps={[
              t("pipelineGeneratingSpecStep1"),
              t("pipelineGeneratingSpecStep2"),
              t("pipelineGeneratingSpecStep3"),
              t("pipelineGeneratingSpecStep4"),
            ]}
            stepIntervalMs={10000}
            timeoutSec={120}
            onCancel={onCancel}
          />
        )}
      </PanelContainer>
    );
  }

  /* ---- Analyzed: show analysis result (Task 6: Plan component) ---- */
  if (status === "analyzed" && analysisResult && !isExecuting && !spec) {
    return (
      <PanelContainer>
        <Plan>
          <PlanHeader>
            <div>
              <PlanTitle>{t("pipelineAnalyzed")}</PlanTitle>
              <PlanDescription>
                {`${analysisResult.features.length}개 기능 분석 완료`}
              </PlanDescription>
              {showTokens && lastUsage ? (
                <TokenBadge usage={lastUsage} />
              ) : null}
            </div>
            <PlanTrigger />
          </PlanHeader>

          <PlanContent>
            {/* Summary */}
            <p className="text-muted-foreground text-sm">{analysisResult.summary}</p>

            {/* Feature cards */}
            <div className="mt-4 flex flex-col gap-3">
              {analysisResult.features.map((feature, i) => (
                <FeatureCard key={i} feature={feature} />
              ))}
            </div>

            {/* Recommendation */}
            <div className="bg-primary/5 mt-4 rounded-lg p-3">
              <p className="text-primary text-xs font-medium">{t("pipelineRecommendation")}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {analysisResult.recommendation}
              </p>
            </div>

            {/* Diagrams */}
            <DiagramSection sessionId={sessionId} />
          </PlanContent>

          <PlanFooter>
            <PlanAction>
              <Button onClick={onGenerateSpec}>
                <FileCode2 className="mr-2 size-4" />
                {t("pipelineGenerateSpec")}
              </Button>
              {onDesignScreens ? (
                <Button variant="outline" onClick={handleDesignScreens}>
                  <Layout className="mr-2 size-4" />
                  {t("pipelineDesignScreens")}
                </Button>
              ) : null}
            </PlanAction>
          </PlanFooter>
        </Plan>
      </PanelContainer>
    );
  }

  /* ---- Designing state: flow data exists, show link to designer ---- */
  if (status === "designing") {
    return (
      <PanelContainer>
        {spec ? <SpecCard spec={spec} /> : null}
        <div className="mt-4 flex items-center gap-2">
          <CheckCircle2 className="text-primary size-5" />
          <p className="font-medium">{t("screensGenerated")}</p>
        </div>
        {flowScreens && flowScreens.length > 0 ? (
          <ScreenTable screens={flowScreens} />
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {onOpenDesigner ? (
            <Button onClick={onOpenDesigner}>
              <Layout className="mr-2 size-4" />
              {t("pipelineOpenDesigner")}
            </Button>
          ) : null}
          <Button onClick={onExecute}>
            <Play className="mr-2 size-4" />
            {t("pipelineExecute")}
          </Button>
          <Button variant="outline" onClick={onOpenTerminal}>
            <Terminal className="mr-2 size-4" />
            {t("pipelineOpenTerminal")}
          </Button>
        </div>
      </PanelContainer>
    );
  }

  /* ---- Spec generated: show spec (Task 9: MessageResponse for markdown) ---- */
  if ((status === "spec_generated" || (status === "analyzed" && spec)) && !isExecuting) {
    return (
      <PanelContainer>
        <SpecCard spec={spec} />
        {flowScreens && flowScreens.length > 0 ? (
          <ScreenTable screens={flowScreens} />
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {hasFlowData && onOpenDesigner ? (
            <Button variant="outline" onClick={onOpenDesigner}>
              <Layout className="mr-2 size-4" />
              {t("pipelineDesignScreens")}
            </Button>
          ) : onDesignScreens ? (
            <Button variant="outline" onClick={handleDesignScreens}>
              <Layout className="mr-2 size-4" />
              {t("pipelineDesignScreens")}
            </Button>
          ) : null}
          <Button onClick={onExecute}>
            <Play className="mr-2 size-4" />
            {t("pipelineExecute")}
          </Button>
          <Button variant="outline" onClick={onOpenTerminal}>
            <Terminal className="mr-2 size-4" />
            {t("pipelineOpenTerminal")}
          </Button>
        </div>
      </PanelContainer>
    );
  }

  /* ---- Executing locally (Task 7+8: Tool + Terminal in ExecutionLog) ---- */
  if (isExecuting) {
    return (
      <PanelContainer>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="text-primary size-5 animate-spin" />
            <p className="font-medium">{t("pipelineExecuting")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onCancel}>
            <Square className="mr-1 size-3" />
            {t("pipelineStop")}
          </Button>
        </div>
        <div className="mt-3">
          <ExecutionLog events={executionEvents} isExecuting={isExecuting} />
        </div>
        <Button
          variant="link"
          size="sm"
          onClick={onOpenTerminal}
          className="text-primary mt-2 h-auto p-0 text-sm"
        >
          {t("pipelineOpenTerminal")}
        </Button>
      </PanelContainer>
    );
  }

  /* ---- Executing remotely ---- */
  if (status === "executing") {
    return (
      <PanelContainer>
        <div className="flex items-center gap-2">
          <Loader2 className="text-primary size-5 animate-spin" />
          <p className="font-medium">{t("pipelineExecutingRemote")}</p>
        </div>
        <p className="text-muted-foreground mt-2 text-sm">{t("pipelineExecutingRemoteDesc")}</p>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onOpenTerminal}>
            <Terminal className="mr-1 size-3" />
            {t("pipelineOpenTerminal")}
          </Button>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw className="mr-1 size-3" />
            {t("pipelineRetry")}
          </Button>
        </div>
      </PanelContainer>
    );
  }

  /* ---- Executed: show result ---- */
  if (status === "executed") {
    return (
      <PanelContainer>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-green-600" />
          <p className="font-medium">
            {sessionType === "customer"
              ? t("pipelineCustomerComplete")
              : t("pipelineOperatorComplete")}
          </p>
        </div>
        {sessionType === "customer" ? (
          <div className="mt-3">
            <p className="text-muted-foreground text-sm">{t("pipelineCustomerCompleteDesc")}</p>
            {analysisResult ? (
              <div className="mt-2 flex flex-col gap-1">
                {analysisResult.features.map((f, i) => (
                  <span key={i} className="text-sm">
                    {"\u2022"} {f.description}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2 text-sm">
            {executionResult?.prUrl ? (
              <a
                href={executionResult.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="size-3.5" />
                PR #{executionResult.prNumber}: {executionResult.prUrl}
              </a>
            ) : null}
          </div>
        )}
      </PanelContainer>
    );
  }

  /* ---- Failed ---- */
  if (status === "failed") {
    return (
      <PanelContainer>
        <div className="flex items-center gap-2">
          <AlertCircle className="text-destructive size-5" />
          <p className="font-medium">{t("pipelineFailed")}</p>
        </div>
        {executionError ? (
          <p className="text-muted-foreground mt-2 text-sm">{executionError}</p>
        ) : null}
        <Button variant="outline" className="mt-3" onClick={onRetry}>
          <RotateCcw className="mr-2 size-4" />
          {t("pipelineRetry")}
        </Button>
      </PanelContainer>
    );
  }

  return null;
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function PanelContainer({ children }: { children: React.ReactNode }) {
  return <div className="bg-background rounded-xl border p-4 shadow-sm">{children}</div>;
}

const WIREFRAME_LABELS: Record<string, string> = {
  form: "폼",
  list: "목록",
  detail: "상세",
  dashboard: "대시보드",
  settings: "설정",
  landing: "랜딩",
  empty: "빈 화면",
};

function ScreenTable({ screens }: { screens: FlowScreen[] }) {
  const [listExpanded, setListExpanded] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const visibleScreens = listExpanded ? screens : screens.slice(0, 5);
  const hasMore = screens.length > 5;

  return (
    <div className="mt-3 rounded-lg border">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Layout className="text-primary size-4" />
        <span className="text-sm font-medium">화면 목록 ({screens.length}개)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left">
              <th className="w-8 px-3 py-2 font-medium text-muted-foreground">#</th>
              <th className="px-3 py-2 font-medium text-muted-foreground">화면명</th>
              <th className="px-3 py-2 font-medium text-muted-foreground">유형</th>
              <th className="px-3 py-2 font-medium text-muted-foreground">설명</th>
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {visibleScreens.map((screen, i) => {
              const isRowExpanded = expandedRowId === screen.id;
              const detail = screen.detail;
              const hasDetail = detail && Object.keys(detail).length > 0;
              const keyElements = detail?.keyElements ?? (screen.metadata?.keyElements as string[]) ?? [];
              return (
                <ScreenRow
                  key={screen.id}
                  screen={screen}
                  index={i}
                  isExpanded={isRowExpanded}
                  hasDetail={!!hasDetail}
                  keyElements={keyElements}
                  onToggle={() => setExpandedRowId(isRowExpanded ? null : screen.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMore ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setListExpanded((v) => !v)}
          className="text-primary flex w-full items-center justify-center gap-1 rounded-none border-t text-xs"
        >
          {listExpanded ? (
            <>
              <ChevronUp className="size-3" />
              접기
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              {screens.length - 5}개 더 보기
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}

function ScreenRow({
  screen,
  index,
  isExpanded,
  hasDetail,
  keyElements,
  onToggle,
}: {
  screen: FlowScreen;
  index: number;
  isExpanded: boolean;
  hasDetail: boolean;
  keyElements: string[];
  onToggle: () => void;
}) {
  const detail = screen.detail;

  return (
    <>
      <tr
        className={cn(
          "border-b last:border-b-0 hover:bg-muted/20",
          hasDetail ? "cursor-pointer" : "",
          isExpanded ? "bg-muted/10" : "",
        )}
        onClick={hasDetail ? onToggle : undefined}
      >
        <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
        <td className="px-3 py-2 font-medium">{screen.name}</td>
        <td className="px-3 py-2">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs">
            {WIREFRAME_LABELS[screen.wireframeType] ?? screen.wireframeType}
          </span>
        </td>
        <td className="px-3 py-2 text-muted-foreground">
          <span className="line-clamp-2">{screen.description}</span>
          {keyElements.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {keyElements.slice(0, 4).map((el) => (
                <span key={el} className="rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">
                  {el}
                </span>
              ))}
              {keyElements.length > 4 ? (
                <span className="text-[10px] text-muted-foreground">+{keyElements.length - 4}</span>
              ) : null}
            </div>
          ) : null}
        </td>
        <td className="px-2 py-2">
          {hasDetail ? (
            isExpanded ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : null}
        </td>
      </tr>
      {isExpanded && detail ? (
        <tr>
          <td colSpan={5} className="border-b bg-muted/5 px-3 py-3">
            <ScreenDetailInline detail={detail} routePath={detail.routePath} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ScreenDetailInline({ detail, routePath }: { detail: FlowScreen["detail"]; routePath?: string }) {
  if (!detail) return null;

  const sections = [
    { label: "개요", items: [
      detail.screenGoal ? { label: "화면 목표", value: detail.screenGoal } : null,
      detail.primaryUser ? { label: "주요 사용자", value: detail.primaryUser } : null,
      routePath ? { label: "라우트", value: routePath, mono: true } : null,
    ].filter(Boolean) as Array<{ label: string; value: string; mono?: boolean }> },
    { label: "UI 구성", chips: [
      { label: "핵심 요소", items: detail.keyElements ?? [] },
      { label: "입력 필드", items: detail.inputs ?? [] },
      { label: "액션", items: detail.actions ?? [] },
    ].filter((c) => c.items.length > 0) },
    { label: "상태/조건", chips: [
      { label: "상태", items: detail.states ?? [] },
      { label: "진입 조건", items: detail.entryConditions ?? [] },
      { label: "종료 조건", items: detail.exitConditions ?? [] },
    ].filter((c) => c.items.length > 0) },
  ];

  const hasNotes = !!detail.notes;

  return (
    <div className="grid grid-cols-1 gap-3 text-xs">
      {sections.map((section) => {
        const hasItems = (section.items && section.items.length > 0) || (section.chips && section.chips.length > 0);
        if (!hasItems) return null;
        return (
          <div key={section.label}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </span>
            {section.items ? (
              <div className="mt-1 flex flex-col gap-1">
                {section.items.map((item) => (
                  <div key={item.label} className="flex items-baseline gap-2">
                    <span className="shrink-0 text-muted-foreground">{item.label}:</span>
                    <span className={cn("text-foreground", item.mono ? "font-mono" : "")}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {section.chips ? (
              <div className="mt-1 flex flex-col gap-1.5">
                {section.chips.map((chip) => (
                  <div key={chip.label}>
                    <span className="text-muted-foreground">{chip.label}: </span>
                    <span className="inline-flex flex-wrap gap-1">
                      {chip.items.map((item) => (
                        <span key={item} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {item}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      {hasNotes ? (
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">메모</span>
          <p className="mt-1 text-muted-foreground">{detail.notes}</p>
        </div>
      ) : null}
    </div>
  );
}

function SpecCard({ spec }: { spec: string | null }) {
  const { t } = useFeatureTranslation("agent-desk");
  const [expanded, setExpanded] = useState(false);

  if (!spec) return null;

  return (
    <div className="bg-muted/30 rounded-lg border">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <FileCode2 className="text-primary size-4" />
        <span className="text-sm font-medium">{t("pipelineSpecTitle")}</span>
      </div>
      <div className="px-3 py-2">
        <div
          className={
            expanded
              ? "text-sm leading-relaxed"
              : "relative max-h-32 overflow-hidden text-sm leading-relaxed"
          }
        >
          <MessageResponse>{spec}</MessageResponse>
          {!expanded ? (
            <div className="from-muted/30 absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t to-transparent" />
          ) : null}
        </div>
        <Button
          variant="link"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="text-primary mt-1 h-auto gap-1 p-0 text-xs"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" />
              {t("pipelineSpecCollapse")}
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              {t("pipelineSpecExpand")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function FeatureCard({ feature }: { feature: AnalysisFeature }) {
  const { t } = useFeatureTranslation("agent-desk");
  const [expanded, setExpanded] = useState(false);
  const hasExisting = feature.existingFeatures.length > 0;
  const hasGaps = feature.gaps.length > 0;

  return (
    <div className="bg-background rounded-lg border">
      {/* Header */}
      <Button
        variant="ghost"
        className="flex h-auto w-full items-center justify-between p-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium">{feature.name}</span>
          <PriorityBadge priority={feature.priority} />
          <ComplexityBadge complexity={feature.complexity} />
        </div>
        {expanded ? (
          <ChevronUp className="text-muted-foreground size-4" />
        ) : (
          <ChevronDown className="text-muted-foreground size-4" />
        )}
      </Button>

      {/* Description */}
      <p className="text-muted-foreground px-3 pb-2 text-sm">{feature.description}</p>

      {/* Expandable detail */}
      {expanded ? (
        <div className="border-t px-3 py-3">
          {/* Existing features */}
          {hasExisting ? (
            <div className="mb-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-green-600">
                <PackageCheck className="size-3.5" />
                {t("pipelineExistingFeatures")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {feature.existingFeatures.map((name) => (
                  <span
                    key={name}
                    className="rounded-md bg-green-600/10 px-2 py-0.5 text-xs text-green-600"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Gaps */}
          {hasGaps ? (
            <div>
              <div className="text-destructive mb-1.5 flex items-center gap-1.5 text-xs font-medium">
                <PackagePlus className="size-3.5" />
                {t("pipelineGaps", { count: feature.gaps.length })}
              </div>
              <ul className="flex flex-col gap-1">
                {feature.gaps.map((gap, i) => (
                  <li key={i} className="text-muted-foreground flex items-start gap-2 text-sm">
                    <span className="bg-destructive/50 mt-1 size-1.5 shrink-0 rounded-full" />
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!hasExisting && !hasGaps ? (
            <p className="text-muted-foreground text-sm">{t("pipelineNoDetail")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const { t } = useFeatureTranslation("agent-desk");
  const colors: Record<string, string> = {
    high: "bg-destructive/10 text-destructive",
    medium: "bg-yellow-600/10 text-yellow-600",
    low: "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = {
    high: t("priorityHigh"),
    medium: t("priorityMedium"),
    low: t("priorityLow"),
  };
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs ${colors[priority] ?? colors.low}`}>
      {labels[priority] ?? priority}
    </span>
  );
}

function ComplexityBadge({ complexity }: { complexity: string }) {
  const { t } = useFeatureTranslation("agent-desk");
  const colors: Record<string, string> = {
    complex: "bg-destructive/10 text-destructive",
    moderate: "bg-yellow-600/10 text-yellow-600",
    simple: "bg-green-600/10 text-green-600",
  };
  const labels: Record<string, string> = {
    complex: t("complexityComplex"),
    moderate: t("complexityModerate"),
    simple: t("complexitySimple"),
  };
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs ${colors[complexity] ?? colors.moderate}`}>
      {labels[complexity] ?? complexity}
    </span>
  );
}

interface ProgressStepsProps {
  steps: string[];
  stepIntervalMs: number;
  timeoutSec: number;
  onCancel?: () => void;
}

function ProgressSteps({ steps, stepIntervalMs, timeoutSec, onCancel }: ProgressStepsProps) {
  const { t } = useFeatureTranslation("agent-desk");
  const [elapsed, setElapsed] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const startTimeRef = useRef(Date.now());
  const showTokenUsage = useAtomValue(showTokenUsageAtom);
  const lastTokenUsage = useAtomValue(lastTokenUsageAtom);

  useEffect(() => {
    const timer = setInterval(() => {
      const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(sec);
      const step = Math.min(Math.floor(sec / (stepIntervalMs / 1000)), steps.length - 1);
      setActiveStep(step);
    }, 1000);
    return () => clearInterval(timer);
  }, [stepIntervalMs, steps.length]);

  const isTimeout = elapsed >= timeoutSec;

  return (
    <div className="mt-3 space-y-3">
      {/* 경과 시간 + 토큰 사용량 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">
            {t("pipelineElapsed", { seconds: elapsed })}
          </span>
          {showTokenUsage && lastTokenUsage ? (
            <TokenBadge usage={lastTokenUsage} />
          ) : null}
        </div>
        {onCancel ? (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onCancel}>
            <Square className="mr-1 size-2.5" />
            {t("pipelineCancel")}
          </Button>
        ) : null}
      </div>

      {/* 단계별 진행 표시 */}
      <div className="flex flex-col gap-1.5">
        {steps.map((step, i) => {
          const isDone = i < activeStep;
          const isCurrent = i === activeStep;

          return (
            <div key={i} className="flex items-center gap-2">
              {isDone ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
              ) : isCurrent ? (
                <Loader2 className="text-primary size-3.5 shrink-0 animate-spin" />
              ) : (
                <div className="bg-muted size-3.5 shrink-0 rounded-full" />
              )}
              <span
                className={cn(
                  "text-xs transition-colors",
                  isDone ? "text-muted-foreground line-through" : "",
                  isCurrent ? "text-foreground font-medium" : "",
                  !isDone && !isCurrent ? "text-muted-foreground/50" : "",
                )}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>

      {/* 타임아웃 경고 */}
      {isTimeout ? (
        <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-yellow-600" />
          <p className="text-xs text-yellow-600">{t("pipelineTimeoutWarning")}</p>
        </div>
      ) : null}
    </div>
  );
}

/* Streaming progress - SSE 실시간 단계 표시 */

const STREAMING_STAGES = [
  { key: "loading_data", label: "데이터 로딩" },
  { key: "building_prompt", label: "프롬프트 구성" },
  { key: "llm_streaming", label: "AI 처리 중" },
  { key: "parsing", label: "결과 파싱" },
  { key: "saving", label: "결과 저장" },
];

interface StreamingProgressProps {
  stage: string;
  stageMessage?: string | null;
  onCancel?: () => void;
}

function StreamingProgress({ stage, stageMessage, onCancel }: StreamingProgressProps) {
  const { t } = useFeatureTranslation("agent-desk");
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(Date.now());
  const showTokenUsage = useAtomValue(showTokenUsageAtom);
  const lastTokenUsage = useAtomValue(lastTokenUsageAtom);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const currentIdx = STREAMING_STAGES.findIndex((s) => s.key === stage);

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">
            {t("pipelineElapsed", { seconds: elapsed })}
          </span>
          {showTokenUsage && lastTokenUsage ? (
            <TokenBadge usage={lastTokenUsage} />
          ) : null}
        </div>
        {onCancel ? (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onCancel}>
            <Square className="mr-1 size-2.5" />
            {t("pipelineCancel")}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        {STREAMING_STAGES.map((s, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={s.key} className="flex items-center gap-2">
              {isDone ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
              ) : isCurrent ? (
                <Loader2 className="text-primary size-3.5 shrink-0 animate-spin" />
              ) : (
                <div className="bg-muted size-3.5 shrink-0 rounded-full" />
              )}
              <span
                className={cn(
                  "text-xs transition-colors",
                  isDone ? "text-muted-foreground line-through" : "",
                  isCurrent ? "text-foreground font-medium" : "",
                  !isDone && !isCurrent ? "text-muted-foreground/50" : "",
                )}
              >
                {isCurrent && stageMessage ? stageMessage : s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Token usage badge - Claude 터미널 스타일 */
function TokenBadge({ usage }: { usage: { promptTokens: number; completionTokens: number; totalTokens: number } }) {
  const formatTokens = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px]">
      <span className="text-blue-500">↑{formatTokens(usage.promptTokens)}</span>
      <span className="text-green-500">↓{formatTokens(usage.completionTokens)}</span>
      <span className="text-muted-foreground">Σ{formatTokens(usage.totalTokens)}</span>
    </span>
  );
}

function DiagramSection({ sessionId }: { sessionId: string }) {
  const { t } = useFeatureTranslation("agent-desk");
  const diagramsQuery = useDiagrams(sessionId);
  const generateMutation = useGenerateFromAnalysis();
  const [expanded, setExpanded] = useState(false);

  const diagrams = diagramsQuery.data?.diagrams ?? [];
  const summary = diagramsQuery.data?.summary;
  const hasDiagrams = diagrams.length > 0;

  const handleGenerate = () => {
    generateMutation.mutate({ sessionId });
  };

  return (
    <div className="mt-4 rounded-lg border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <GitBranch className="text-primary size-4" />
          <span className="text-sm font-medium">{t("diagramSectionTitle")}</span>
        </div>
        {hasDiagrams ? (
          <Button
            variant="link"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="text-primary h-auto gap-1 p-0 text-xs"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3" />
                {t("pipelineSpecCollapse")}
              </>
            ) : (
              <>
                <ChevronDown className="size-3" />
                {t("pipelineSpecExpand")}
              </>
            )}
          </Button>
        ) : null}
      </div>

      <div className="px-3 py-3">
        {generateMutation.isPending ? (
          <div className="flex items-center gap-3">
            <Loader2 className="text-primary size-4 animate-spin" />
            <div>
              <p className="text-sm font-medium">{t("diagramGenerating")}</p>
              <p className="text-muted-foreground text-xs">{t("diagramGeneratingDesc")}</p>
            </div>
          </div>
        ) : hasDiagrams ? (
          <>
            {summary ? <p className="text-muted-foreground mb-3 text-xs">{summary}</p> : null}
            {expanded ? (
              <div className="grid gap-4">
                {diagrams.map((diagram: DiagramResult) => (
                  <MermaidDiagram
                    key={diagram.type}
                    code={diagram.mermaidCode}
                    title={diagram.title}
                  />
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-xs">
                {diagrams.length}개 다이어그램 생성됨
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">{t("diagramEmpty")}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
            >
              <GitBranch className="mr-1.5 size-3.5" />
              {t("diagramGenerate")}
            </Button>
          </div>
        )}

        {generateMutation.isError ? (
          <p className="text-destructive mt-2 text-xs">{t("diagramGenerateFailed")}</p>
        ) : null}
      </div>
    </div>
  );
}

