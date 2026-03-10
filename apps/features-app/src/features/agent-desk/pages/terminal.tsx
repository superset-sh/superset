import { useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  ArrowLeft,
  Play,
  Square,
  ExternalLink,
  Loader2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  FileCode2,
  X,
} from "lucide-react";
import { useState } from "react";
import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";
import { useSession, useLatestExecution, useExecutionStream, useCancelExecution, useXterm } from "../hooks";
import { StatusBadge } from "../components/status-badge";
import { MarkdownContent } from "@superbuilder/feature-ui/chat/chat-message";

interface Props {
  sessionId: string;
  autoStart?: boolean;
  /** 채팅 페이지에 패널로 임베드될 때 true */
  embedded?: boolean;
  /** embedded 모드에서 패널 닫기 콜백 */
  onClose?: () => void;
}

export function Terminal({ sessionId, autoStart = false, embedded = false, onClose }: Props) {
  const { t } = useFeatureTranslation("agent-desk");
  const navigate = useNavigate();
  const [specExpanded, setSpecExpanded] = useState(false);

  const { data: session, isLoading } = useSession(sessionId);
  const { data: latestExecution } = useLatestExecution(sessionId);
  const { containerRef, writeln, clear, isReady } = useXterm();
  const {
    execute,
    abort: abortExecution,
    isExecuting,
    events: executionEvents,
    result: executionResult,
    error: executionError,
  } = useExecutionStream();
  const cancelExecution = useCancelExecution();

  // 이전 실행 로그를 터미널에 표시
  useEffect(() => {
    if (!isReady || !latestExecution?.log) return;
    const lines = latestExecution.log.split("\n");
    for (const line of lines) {
      writeln(line);
    }
  }, [isReady, latestExecution?.log, writeln]);

  // 실행 이벤트를 터미널에 실시간 출력
  useEffect(() => {
    if (!isReady || executionEvents.length === 0) return;
    const latest = executionEvents[executionEvents.length - 1];
    if (!latest) return;

    if (latest.type === "log" && latest.content) {
      writeln(latest.content);
    } else if (latest.type === "tool_call" && latest.tool) {
      writeln(`\x1b[35m❯ ${latest.tool}\x1b[0m \x1b[90m${latest.detail ?? ""}\x1b[0m`);
    } else if (latest.type === "tool_output" && latest.content) {
      for (const line of latest.content.split("\n")) {
        writeln(`\x1b[90m  ${line}\x1b[0m`);
      }
    } else if (latest.type === "status" && latest.status) {
      writeln(`\x1b[33m[STATUS]\x1b[0m ${latest.status}`);
    } else if (latest.type === "progress" && latest.step) {
      writeln(`\x1b[33m[STEP ${latest.step}/${latest.total ?? "?"}]\x1b[0m ${latest.content ?? ""}`);
    } else if (latest.type === "result") {
      const doneMsg = session?.type === "operator" && latest.prUrl
        ? `PR created: ${latest.prUrl}`
        : "Execution completed";
      writeln(`\x1b[32m[DONE]\x1b[0m ${doneMsg}`);
    } else if (latest.type === "error") {
      writeln(`\x1b[31m[ERROR]\x1b[0m ${latest.message ?? "Unknown error"}`);
    }
  }, [isReady, executionEvents.length, writeln]);

  const handleExecute = useCallback(() => {
    clear();
    writeln("\x1b[35m$ Starting execution...\x1b[0m\n");
    execute(sessionId);
  }, [clear, writeln, execute, sessionId]);

  const handleCancel = useCallback(() => {
    abortExecution();
    cancelExecution.mutate({ sessionId });
    writeln("\n\x1b[31m$ Execution cancelled\x1b[0m");
  }, [abortExecution, cancelExecution, sessionId, writeln]);

  const handleBack = useCallback(() => {
    if (embedded && onClose) {
      onClose();
    } else {
      navigate({ to: "/agent-desk/$sessionId", params: { sessionId } });
    }
  }, [embedded, onClose, navigate, sessionId]);

  // autoStart: 터미널 준비 + spec 존재 + 이전 실행 없음 → 자동 실행
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (!autoStart || autoStarted || !isReady || !session || isExecuting) return;
    const spec = session.spec;
    const sessionStatus = session.status;
    if (spec && sessionStatus !== "executed" && sessionStatus !== "failed" && sessionStatus !== "executing") {
      setAutoStarted(true);
      clear();
      writeln("\x1b[35m$ Starting execution...\x1b[0m\n");
      execute(sessionId);
    }
  }, [autoStart, autoStarted, isReady, session, isExecuting, clear, writeln, execute, sessionId]);

  if (isLoading) {
    return <TerminalSkeleton />;
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t("sessionNotFound")}</p>
      </div>
    );
  }

  const spec = session.spec;
  const sessionStatus = session.status;
  const isCompleted = sessionStatus === "executed";
  const isFailed = sessionStatus === "failed";

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        {!embedded && (
          <Button variant="ghost" size="icon" className="shrink-0" onClick={handleBack}>
            <ArrowLeft className="size-5" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-medium">{session.title ?? t("terminalTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("terminalSubtitle")}</p>
        </div>
        <StatusBadge status={sessionStatus} />
        {embedded && onClose && (
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
            <X className="size-5" />
          </Button>
        )}
      </div>

      {/* Spec Panel (collapsible) */}
      {spec && (
        <div className="border-b">
          <Button
            variant="ghost"
            onClick={() => setSpecExpanded((v) => !v)}
            className="flex h-auto w-full items-center justify-between px-4 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <FileCode2 className="size-4 text-primary" />
              <span className="font-medium">{t("pipelineSpecTitle")}</span>
            </div>
            {specExpanded ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </Button>
          {specExpanded && (
            <div className="max-h-40 overflow-y-auto border-t bg-muted/20 px-4 py-3">
              <div className="text-sm leading-relaxed">
                <MarkdownContent content={spec} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Terminal (xterm.js) */}
      <div className="min-h-[200px] flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="size-full"
          style={{ padding: "8px" }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t px-4 py-3">
        {!isExecuting && !isCompleted && !isFailed && spec && (
          <Button onClick={handleExecute}>
            <Play className="mr-2 size-4" />
            {t("terminalExecute")}
          </Button>
        )}

        {isExecuting && (
          <Button variant="outline" onClick={handleCancel}>
            <Square className="mr-2 size-4" />
            {t("pipelineStop")}
          </Button>
        )}

        {isFailed && (
          <Button variant="outline" onClick={handleExecute}>
            <RotateCcw className="mr-2 size-4" />
            {t("pipelineRetry")}
          </Button>
        )}

        {isExecuting && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("executionRunning")}
          </div>
        )}

        {session?.type === "operator" && executionResult?.prUrl && (
          <a
            href={executionResult.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" />
            PR #{executionResult.prNumber}
          </a>
        )}

        {executionError && (
          <p className="ml-auto text-sm text-destructive">{executionError}</p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function TerminalSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="size-9 animate-pulse rounded-lg bg-muted" />
        <div className="flex flex-col gap-1.5">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="flex-1 animate-pulse bg-[#0d0d0d]" />
    </div>
  );
}
