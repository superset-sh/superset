/**
 * Phase 1 parity dev panel.
 *
 * Renders inside ChatSurface (flag on) and shows counts + divergences
 * between the new v2 chat store and the legacy tRPC `listMessages`
 * output for the active session. Rendered only when NODE_ENV is
 * "development".
 *
 * Plan reference: 20260421-v2-chat-refactor-phased-plan.md §1.3.
 */

import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo, useState } from "react";
import { useChatStore } from "../../../../store/chatStore";
import type { LegacyLikeMessage } from "./ChatStoreDebug.logic";
import {
	deriveParitySummary,
	isInParity,
} from "./ChatStoreDebug.logic";

export interface ChatStoreDebugProps {
	sessionId: string | null;
	workspaceId: string;
}

export function ChatStoreDebug({
	sessionId,
	workspaceId,
}: ChatStoreDebugProps) {
	const [collapsed, setCollapsed] = useState(false);

	const storeMessages = useChatStore((s) =>
		sessionId ? s.messages[sessionId] : undefined,
	);
	const storeParts = useChatStore((s) => s.parts);
	const storeStatus = useChatStore((s) =>
		sessionId ? s.status[sessionId] : undefined,
	);

	const legacyQuery = workspaceTrpc.chat.listMessages.useQuery(
		sessionId
			? { sessionId, workspaceId }
			: (undefined as unknown as { sessionId: string; workspaceId: string }),
		{ enabled: !!sessionId, refetchOnWindowFocus: false, refetchInterval: 1_000 },
	);

	const summary = useMemo(() => {
		return deriveParitySummary({
			slice: storeMessages
				? { messages: storeMessages, parts: storeParts }
				: null,
			legacy:
				(legacyQuery.data as unknown as LegacyLikeMessage[] | undefined) ??
				null,
		});
	}, [storeMessages, storeParts, legacyQuery.data]);

	const inParity = isInParity(summary);

	if (!sessionId) return null;

	return (
		<div
			className="pointer-events-auto fixed right-2 bottom-2 z-50 max-w-[300px] rounded-md border bg-background px-3 py-2 text-[11px] shadow-md font-mono"
			style={{ opacity: 0.92 }}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="font-semibold">chat-store parity</span>
				<span
					className={
						inParity ? "text-green-600 dark:text-green-400" : "text-amber-600"
					}
				>
					{inParity ? "ok" : "diverged"}
				</span>
				<button
					type="button"
					className="text-muted-foreground hover:text-foreground"
					onClick={() => setCollapsed((v) => !v)}
				>
					{collapsed ? "▸" : "▾"}
				</button>
			</div>
			{!collapsed && (
				<div className="mt-1 space-y-0.5">
					<Row
						label="messages"
						a={summary.newMessages}
						b={summary.legacyMessages}
					/>
					<Row label="user" a={summary.newUser} b={summary.legacyUser} />
					<Row
						label="assistant"
						a={summary.newAssistant}
						b={summary.legacyAssistant}
					/>
					<Row
						label="parts / content"
						a={summary.newParts}
						b={summary.legacyContent}
					/>
					<div className="text-muted-foreground pt-1">
						status: {storeStatus?.type ?? "—"}
					</div>
					{summary.missingInNew.length > 0 && (
						<div className="text-amber-600">
							missing: {summary.missingInNew.slice(0, 3).join(", ")}
							{summary.missingInNew.length > 3 && "…"}
						</div>
					)}
					{summary.extraInNew.length > 0 && (
						<div className="text-amber-600">
							extra: {summary.extraInNew.slice(0, 3).join(", ")}
							{summary.extraInNew.length > 3 && "…"}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function Row({ label, a, b }: { label: string; a: number; b: number }) {
	const diff = a === b;
	return (
		<div className="flex justify-between gap-2">
			<span className="text-muted-foreground">{label}</span>
			<span className={diff ? "" : "text-amber-600"}>
				{a} / {b}
			</span>
		</div>
	);
}
