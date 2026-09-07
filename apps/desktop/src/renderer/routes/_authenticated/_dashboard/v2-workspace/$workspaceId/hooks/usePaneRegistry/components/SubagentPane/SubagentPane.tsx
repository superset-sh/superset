import { Trans, useLingui } from "@lingui/react/macro";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useRef } from "react";
import { LuCornerLeftUp } from "react-icons/lu";
import type { SubagentPaneData } from "../../../../types";
import { SubagentTranscriptRow } from "./components/SubagentTranscriptRow";

interface SubagentPaneProps {
	data: SubagentPaneData;
	/** Focus the parent agent's terminal pane. */
	onOpenParent: () => void;
}

/** How often to re-read the child's transcript while it is still running. */
const LIVE_POLL_MS = 1_000;

/**
 * Live view of one subagent's transcript. The host tails the child's own
 * transcript file (Claude `subagents/agent-<id>.jsonl`, Codex child rollout)
 * and the pane polls it while the roster still reports the child as running.
 * Nothing about the transcript is persisted in the pane layout — only the
 * pointer in {@link SubagentPaneData}.
 */
export function SubagentPane({ data, onOpenParent }: SubagentPaneProps) {
	const { t } = useLingui();
	const parentLabel = AGENT_IDENTITY_LABELS[data.agentId] ?? data.agentId;
	const query = workspaceTrpc.terminalAgents.subagentTranscript.useQuery(
		{ terminalId: data.terminalId, subagentId: data.subagentId },
		{
			refetchInterval: (result) =>
				result.state.data?.subagent.endedAt === undefined
					? LIVE_POLL_MS
					: false,
			refetchOnWindowFocus: true,
			staleTime: 0,
		},
	);

	const subagent = query.data?.subagent;
	const transcript = query.data?.transcript;
	const entries = transcript?.entries ?? [];
	const running = subagent !== undefined && subagent.endedAt === undefined;

	// Follow the tail while the reader is already at the bottom, the way a
	// terminal does; a reader scrolled up to inspect something stays put.
	const scrollRef = useRef<HTMLDivElement>(null);
	const stickToBottomRef = useRef(true);
	const lastEntryId = entries[entries.length - 1]?.id;
	useEffect(() => {
		const el = scrollRef.current;
		if (!el || !stickToBottomRef.current || lastEntryId === undefined) return;
		el.scrollTop = el.scrollHeight;
	}, [lastEntryId]);

	const title =
		transcript?.description ?? subagent?.agentType ?? data.agentType ?? null;

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs">
				<button
					type="button"
					onClick={onOpenParent}
					title={t({ message: `Open ${parentLabel}` })}
					className="flex shrink-0 items-center gap-1 rounded-sm px-1 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					<LuCornerLeftUp className="size-3" />
					<span>{parentLabel}</span>
				</button>
				<span className="min-w-0 flex-1 truncate font-medium">
					{title ?? <Trans>Subagent</Trans>}
				</span>
				{subagent?.agentType && subagent.agentType !== title && (
					<span className="shrink-0 text-muted-foreground">
						{subagent.agentType}
					</span>
				)}
				<span
					className={cn(
						"shrink-0 text-[10px]",
						running ? "text-amber-500" : "text-muted-foreground",
					)}
				>
					{query.data === null ? (
						<Trans>Unavailable</Trans>
					) : running ? (
						<Trans>Running</Trans>
					) : (
						<Trans>Finished</Trans>
					)}
				</span>
			</div>
			<div
				ref={scrollRef}
				onScroll={(event) => {
					const el = event.currentTarget;
					stickToBottomRef.current =
						el.scrollHeight - el.scrollTop - el.clientHeight < 24;
				}}
				className="min-h-0 flex-1 overflow-y-auto px-3 py-2 select-text"
			>
				{query.data === null ? (
					<p className="text-xs text-muted-foreground">
						<Trans>
							This subagent is no longer tracked by the host. Its transcript
							stays on disk under the agent's session directory.
						</Trans>
					</p>
				) : entries.length === 0 ? (
					<p className="text-xs text-muted-foreground">
						{query.isLoading ? null : (
							<Trans>Waiting for the subagent's first message…</Trans>
						)}
					</p>
				) : (
					<div className="flex flex-col gap-2">
						{entries.map((entry) => (
							<SubagentTranscriptRow key={entry.id} entry={entry} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}
