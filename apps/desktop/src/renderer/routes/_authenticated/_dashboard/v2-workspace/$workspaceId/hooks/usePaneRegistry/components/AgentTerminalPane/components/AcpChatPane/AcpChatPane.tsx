import { Trans, useLingui } from "@lingui/react/macro";
import type { UserContent } from "@superset/chat/protocol";
import { toast } from "@superset/ui/sonner";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { acpHarnessForPreset } from "renderer/lib/acpHarness";
import { SessionView } from "../../../ChatSession/components/SessionView";
import { useSessionClient } from "../../../ChatSession/hooks/useSessionClient";
import type { ChatForkTarget } from "../../../ChatSession/types";
import { useForkChat } from "../../hooks/useForkChat";
import { AcpChatPending } from "./components/AcpChatPending";
import { AcpRecovery } from "./components/AcpRecovery";

/**
 * The ACP surface of an agent terminal: a chat bridged to the agent session the
 * terminal was running, resumed by its session id. The pty is stopped while
 * this shows, so `agent` comes from the pane rather than the live binding.
 */
export function AcpChatPane({
	agent,
	onAgentSessionChanged,
	onFirstPromptSent,
	onSessionCreated,
	pendingFirstPrompt,
	sessionId,
	workspaceId,
	modelId,
	modeId,
}: {
	workspaceId: string;
	/** `sessionId` is absent until the agent has run a turn to report one. */
	agent: { id: string; sessionId?: string } | undefined;
	sessionId: string | null;
	pendingFirstPrompt?: UserContent[] | null;
	onFirstPromptSent?: (() => void) | undefined;
	onSessionCreated: (sessionId: string) => void;
	onAgentSessionChanged: (harnessSessionId: string) => void;
	modelId?: string;
	modeId?: string;
}) {
	const { t } = useLingui();
	const { client, wiring } = useSessionClient(sessionId);
	const { forkToWorktree, canForkToWorktree } = useForkChat(workspaceId);
	const { hostUrl } = useWorkspaceClient();
	const { data: agentConfigs } = useV2AgentConfigs(hostUrl);
	const agentLabel = agentConfigs?.find(
		(config) => config.id === agent?.id,
	)?.label;
	const harness = acpHarnessForPreset(agent?.id);
	const [failure, setFailure] = useState<string | null>(null);

	// The stored session outlives its process — after a host restart the row
	// still reads "idle" and only the send fails. Ask who is actually running.
	const { data: stored } = useQuery({
		enabled: sessionId !== null,
		queryKey: ["acp-chat-session", sessionId],
		queryFn: () =>
			sessionId
				? wiring.transport.getSession({ sessionId })
				: Promise.resolve(null),
		staleTime: 5_000,
	});

	const attaching = useRef(false);
	const start = useCallback(
		async (resumeHarness: string, resume?: string) => {
			attaching.current = true;
			setFailure(null);
			try {
				const created = await wiring.transport.createSession({
					commandId: crypto.randomUUID(),
					workspaceId,
					harness: resumeHarness,
					...(modelId ? { modelId } : {}),
					...(modeId ? { modeId } : {}),
					...(resume ? { resume: { harnessSessionId: resume } } : {}),
				});
				onSessionCreated(created.sessionId);
			} catch (error) {
				attaching.current = false;
				setFailure(error instanceof Error ? error.message : String(error));
			}
		},
		[wiring.transport, workspaceId, onSessionCreated, modelId, modeId],
	);

	const agentSessionId = agent?.sessionId;
	// Resuming when there is a session to resume, and a plain new one when the
	// pane was opened straight onto the chat and no agent has run yet.
	useEffect(() => {
		if (sessionId || attaching.current || !harness) return;
		void start(harness, agentSessionId);
	}, [sessionId, harness, agentSessionId, start]);

	// Branching opens the copy in this pane; the agent keeps the original, so
	// nothing is lost by following the fork. The agent copies the session whole
	// — `session/fork` takes no truncation point — so where it was clicked from
	// makes no difference to what the branch contains.
	const forkHere = useCallback(() => {
		if (!sessionId) return;
		void wiring.transport
			.forkSession({
				commandId: crypto.randomUUID(),
				sessionId,
				workspaceId,
			})
			.then((forked) => {
				if (forked) {
					onSessionCreated(forked.sessionId);
					return;
				}
				// The adapter declines rather than sending a `session/fork` an
				// agent would reject, and a button that does nothing is worse
				// than one that says why.
				toast.error(t({ message: "This agent can't branch a conversation" }));
			})
			.catch((error: unknown) => {
				console.error("[acp-chat] fork failed", error);
				toast.error(t({ message: "Couldn't branch the conversation" }));
			});
	}, [wiring.transport, sessionId, workspaceId, onSessionCreated, t]);

	// A worktree of its own cannot resume this session — the agent keys its
	// sessions to a project directory — so that branch is a fresh chat handed
	// the conversation. Both live under one control because the user is
	// choosing where the work continues, not which mechanism carries it.
	const fork = useCallback(
		(target: ChatForkTarget, transcript: string) => {
			if (target === "workspace") {
				forkHere();
				return;
			}
			if (!agent) return;
			void forkToWorktree({
				agentId: agent.id,
				agentLabel: agentLabel ?? agent.id,
				transcript,
			});
		},
		[forkHere, forkToWorktree, agent, agentLabel],
	);

	const startFresh = useCallback(() => {
		if (!harness) return;
		attaching.current = false;
		void start(harness);
	}, [harness, start]);

	const sessionDead = stored?.session?.status === "dead";
	const sessionStopped =
		stored !== undefined && stored !== null && !stored.live;
	// A stopped chat has not lost anything: the agent session it was bound to
	// can be loaded again. Reopening a pane should just work, so do it rather
	// than asking. Dead is different — that load already found no transcript.
	const canResume = Boolean(
		sessionStopped && !sessionDead && harness && agentSessionId,
	);

	// Once per mount: if the session we resume into is itself unusable, fall
	// through to the panel instead of spawning adapters in a loop.
	const autoResumed = useRef(false);
	useEffect(() => {
		if (!canResume || autoResumed.current) return;
		if (!harness || !agentSessionId) return;
		autoResumed.current = true;
		attaching.current = false;
		void start(harness, agentSessionId);
	}, [canResume, harness, agentSessionId, start]);

	if (canResume && !autoResumed.current) {
		return (
			<AcpChatPending>
				<Trans>Resuming the conversation…</Trans>
			</AcpChatPending>
		);
	}

	if (harness && sessionId && (sessionDead || sessionStopped)) {
		return (
			<AcpRecovery
				detail={failure ?? undefined}
				onStartNew={startFresh}
				reason={sessionDead ? "no-transcript" : "stopped"}
			/>
		);
	}

	if (!client || !sessionId) {
		if (failure && harness) {
			return (
				<AcpRecovery
					detail={failure}
					onStartNew={startFresh}
					reason="no-transcript"
				/>
			);
		}
		if (!harness) {
			return (
				<div className="flex h-full w-full items-center justify-center p-4 text-center text-muted-foreground text-xs">
					<Trans>This agent can't be opened as a chat.</Trans>
				</div>
			);
		}
		return (
			<AcpChatPending>
				{agentSessionId ? (
					<Trans>Attaching to the running session…</Trans>
				) : (
					<Trans>Starting the agent…</Trans>
				)}
			</AcpChatPending>
		);
	}

	return (
		<SessionView
			client={client}
			key={sessionId}
			onFirstPromptSent={onFirstPromptSent ?? NOOP}
			agentLabel={agentLabel}
			canForkToWorktree={canForkToWorktree}
			onFork={fork}
			onSessionState={(state) => {
				// A resume that found no transcript lands on a different agent
				// session. Keep the pane pointed at the live one, or the trip back
				// to the CLI resumes an id that no longer exists.
				const bound = state?.harnessSessionId;
				if (bound && bound !== agent?.sessionId) onAgentSessionChanged(bound);
			}}
			pendingFirstPrompt={pendingFirstPrompt ?? null}
			sessionId={sessionId}
			workspaceId={workspaceId}
		/>
	);
}

function NOOP() {}
