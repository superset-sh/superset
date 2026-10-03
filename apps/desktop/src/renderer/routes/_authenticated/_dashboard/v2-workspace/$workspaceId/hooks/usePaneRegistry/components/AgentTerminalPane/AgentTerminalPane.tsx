import { Trans } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { useEffect, useRef } from "react";
import type {
	OpenFile,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { TerminalPaneData } from "../../../../types";
import { TerminalPane } from "../TerminalPane";
import { AcpChatPane } from "./components/AcpChatPane";
import { AcpChatPending } from "./components/AcpChatPane/components/AcpChatPending";
import { useAgentSurface } from "./hooks/useAgentSurface";
import { useAgentSurfaceSwitch } from "./hooks/useAgentSurfaceSwitch";

/**
 * A terminal pane, shown on whichever surface its agent calls for. The choice
 * needs the agent binding, which is a hook, so it lives here rather than in the
 * pane registry's render callback.
 */
export function AgentTerminalPane({
	ctx,
	onOpenFile,
	onRevealPath,
	workspaceId,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	onOpenFile: OpenFile;
	onRevealPath: (path: string) => void;
}) {
	const data = ctx.pane.data as TerminalPaneData;
	const { agent, surface } = useAgentSurface(workspaceId, data);
	const { switchSurface } = useAgentSurfaceSwitch(workspaceId);

	// A pane that derives onto the chat has recorded nothing: the agent identity
	// the chat resumes from is not in its data, and the pty it is replacing is
	// still running the agent. Adopting the surface does both, through the same
	// path an explicit toggle takes. Keyed by terminal id so a relaunch can be
	// adopted again, and so this runs once per terminal rather than per render.
	const adopted = useRef<string | null>(null);
	const unrecorded = data.agentSurface === undefined;
	useEffect(() => {
		if (!unrecorded || surface !== "acp" || !agent) return;
		if (adopted.current === data.terminalId) return;
		adopted.current = data.terminalId;
		void switchSurface(ctx, "acp", agent);
	}, [unrecorded, surface, agent, data.terminalId, ctx, switchSurface]);

	// Unmounted, not hidden: its pty is stopped on the chat surface, and a
	// mounted TerminalPane would auto-resume the agent straight back into it.
	if (surface === "acp") {
		if (!data.agent) {
			return (
				<AcpChatPending>
					<Trans>Opening the chat…</Trans>
				</AcpChatPending>
			);
		}
		return (
			<AcpChatPane
				key={data.terminalId}
				agent={data.agent}
				onFirstPromptSent={() => {
					if (
						data.pendingPrompt === undefined &&
						data.pendingAttachments === undefined
					)
						return;
					const {
						pendingPrompt: _sent,
						pendingAttachments: _attached,
						...rest
					} = data;
					ctx.actions.updateData(rest);
				}}
				pendingFirstPrompt={
					data.pendingPrompt || data.pendingAttachments?.length
						? [
								...(data.pendingPrompt
									? [{ type: "text" as const, text: data.pendingPrompt }]
									: []),
								...(data.pendingAttachments ?? []).map((attachment) => ({
									type: "attachment" as const,
									...attachment,
								})),
							]
						: null
				}
				modelId={data.chatModelId}
				modeId={data.chatModeId}
				onAgentSessionChanged={(sessionId) => {
					if (!data.agent) return;
					ctx.actions.updateData({
						...data,
						agent: { ...data.agent, sessionId },
					});
				}}
				onSessionCreated={(acpSessionId) =>
					ctx.actions.updateData({ ...data, acpSessionId })
				}
				sessionId={data.acpSessionId ?? null}
				workspaceId={workspaceId}
			/>
		);
	}

	return (
		<TerminalPane
			ctx={ctx}
			onOpenFile={onOpenFile}
			onRevealPath={onRevealPath}
			workspaceId={workspaceId}
		/>
	);
}
