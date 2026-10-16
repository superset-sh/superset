import type { RendererContext } from "@superset/panes";
import { useRef } from "react";
import { LinkHoverHint } from "renderer/lib/clickPolicy";
import type {
	ChatPaneData,
	OpenFile,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useLinkClickHint } from "../../hooks/useLinkClickHint";
import { AcpChatPane } from "./components/AcpChatPane";
import { useOpenChatLink } from "./hooks/useOpenChatLink";
import { useOpenChatPage } from "./hooks/useOpenChatPage";
import {
	pendingChatPrompts,
	prependChatPrompts,
} from "./utils/pendingChatPrompts";
import { saveChatMode } from "./utils/savedChatMode";

export function ChatPane({
	ctx,
	onOpenFile,
	onRevealPath,
	workspaceId,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	onOpenFile: OpenFile;
	onRevealPath: (path: string, options?: { isDirectory?: boolean }) => void;
}) {
	const data = ctx.pane.data as ChatPaneData;
	const openPage = useOpenChatPage(ctx.store);
	const { hint, showHint } = useLinkClickHint();
	const openLink = useOpenChatLink({
		store: ctx.store,
		workspaceId,
		onOpenFile,
		onRevealPath,
		showHint,
	});
	const latest = useRef(data);
	latest.current = data;
	const pendingPrompts = pendingChatPrompts(data);

	return (
		<>
			<AcpChatPane
				key={`${data.terminalId}:${data.agent?.id}`}
				agent={data.agent}
				isActive={ctx.isActive}
				onPendingPromptsSent={() => {
					const {
						pendingPrompt: _sent,
						pendingAttachments: _attached,
						queuedPrompts: _queued,
						...rest
					} = latest.current;
					latest.current = rest;
					ctx.actions.updateData(rest);
				}}
				onQueuePrompt={(content) => {
					latest.current = {
						...latest.current,
						queuedPrompts: [...(latest.current.queuedPrompts ?? []), content],
					};
					ctx.actions.updateData(latest.current);
				}}
				onRestoreQueuedPrompts={(prompts) => {
					latest.current = prependChatPrompts(latest.current, prompts);
					ctx.actions.updateData(latest.current);
				}}
				pendingPrompts={pendingPrompts}
				modelId={data.chatModelId}
				modelLabel={data.chatModelLabel}
				modeId={data.chatModeId}
				onSessionInfo={({ harnessSessionId, title }) => {
					const rebound = harnessSessionId !== undefined && data.agent;
					const retitled = title !== undefined && title !== data.chatTitle;
					if (!rebound && !retitled) return;
					ctx.actions.updateData({
						...data,
						...(rebound
							? { agent: { ...rebound, sessionId: harnessSessionId } }
							: {}),
						...(retitled ? { chatTitle: title } : {}),
					});
				}}
				onSwitchAgent={({ presetId, label, model, modeId, handoffPrompt }) => {
					ctx.actions.setTitle(label);
					ctx.actions.updateData({
						terminalId: data.terminalId,
						sessionId: null,
						agent: { id: presetId },
						...(model
							? { chatModelId: model.id, chatModelLabel: model.label }
							: {}),
						...(modeId ? { chatModeId: modeId } : {}),
						...(handoffPrompt ? { pendingPrompt: handoffPrompt } : {}),
					});
				}}
				onForkAgent={({ presetId, label, model, modeId, handoffPrompt }) =>
					ctx.store.getState().addTab({
						panes: [
							{
								kind: "chat-v3",
								titleOverride: label,
								data: {
									terminalId: crypto.randomUUID(),
									sessionId: null,
									agent: { id: presetId },
									...(model
										? { chatModelId: model.id, chatModelLabel: model.label }
										: {}),
									...(modeId ? { chatModeId: modeId } : {}),
									pendingPrompt: handoffPrompt,
								} satisfies ChatPaneData,
							},
						],
					})
				}
				onModeChange={(chatModeId) => {
					if (data.agent) saveChatMode(data.agent.id, chatModeId);
					ctx.actions.updateData({ ...data, chatModeId });
				}}
				onSessionCreated={(sessionId) =>
					ctx.actions.updateData({ ...latest.current, sessionId })
				}
				onOpenFile={onOpenFile}
				onOpenPage={openPage}
				onOpenLink={openLink}
				sessionId={data.sessionId}
				terminalId={data.terminalId}
				workspaceId={workspaceId}
			/>
			<LinkHoverHint hoverLabel={null} hoverPosition={null} clickHint={hint} />
		</>
	);
}
