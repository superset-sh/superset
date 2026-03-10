import { useMemo } from "react";
import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";
import {
  Terminal,
  TerminalHeader,
  TerminalTitle,
  TerminalStatus,
  TerminalActions,
  TerminalCopyButton,
  TerminalContent,
} from "@superbuilder/feature-ui/ai/terminal";
import { Tool, ToolHeader, ToolContent, ToolOutput } from "@superbuilder/feature-ui/ai/tool";
import type { ExecutionEvent } from "../types";

interface Props {
  events: ExecutionEvent[];
  isExecuting: boolean;
}

export function ExecutionLog({ events, isExecuting }: Props) {
  const { t } = useFeatureTranslation("agent-desk");

  const logEvents = events.filter((e) => e.type === "log" || e.type === "progress");
  const toolEvents = events.filter((e) => e.type === "tool_call" || e.type === "tool_output");

  const terminalOutput = useMemo(
    () =>
      logEvents
        .map((e) => (e.type === "progress" && e.step ? `> ${e.step}` : e.content ?? ""))
        .join("\n"),
    [logEvents],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Tool calls */}
      {toolEvents.map((event, i) =>
        event.type === "tool_call" ? (
          <Tool key={i} defaultOpen>
            <ToolHeader
              title={event.tool ?? "tool"}
              type="function"
              state="output-available"
            />
            <ToolContent>
              <p className="text-muted-foreground text-sm">{event.detail}</p>
            </ToolContent>
          </Tool>
        ) : (
          <Tool key={i}>
            <ToolOutput output={event.content ?? ""} errorText={undefined} />
          </Tool>
        ),
      )}

      {/* Terminal output */}
      {(logEvents.length > 0 || isExecuting) ? (
        <Terminal
          output={terminalOutput}
          isStreaming={isExecuting}
          autoScroll
        >
          <TerminalHeader>
            <TerminalTitle>{t("executionLog")}</TerminalTitle>
            <TerminalActions>
              <TerminalStatus />
              <TerminalCopyButton />
            </TerminalActions>
          </TerminalHeader>
          <TerminalContent className="max-h-48" />
        </Terminal>
      ) : null}
    </div>
  );
}
