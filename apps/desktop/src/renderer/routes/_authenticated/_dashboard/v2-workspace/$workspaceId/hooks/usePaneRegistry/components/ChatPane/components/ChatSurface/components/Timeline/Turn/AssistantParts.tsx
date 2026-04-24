/**
 * Renders the Parts of one assistant message in order. The streaming
 * boundary indicator is drawn by the Timeline row (not here) so this
 * component stays dumb.
 *
 * Consecutive context-only tool calls (read / grep / glob / list)
 * collapse into one ContextGroupCard — Phase 3.3 port from OpenCode's
 * message-part.tsx:696-761.
 */

import type { AssistantMessage, Part } from "@superset/chat/shared";
import { useMemo } from "react";
import { renderPart } from "../Parts";
import { ContextGroupCard } from "./ContextGroupCard";
import { groupContextRuns } from "./groupContextRuns";

export function AssistantParts({
	message,
	parts,
	streaming,
}: {
	message: AssistantMessage;
	parts: Part[];
	streaming: boolean;
}) {
	if (message.error) {
		return (
			<div
				data-message-id={message.id}
				className="text-muted-foreground my-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs dark:border-red-900 dark:bg-red-950/50"
			>
				<div className="mb-1 font-medium text-red-700 dark:text-red-300">
					Assistant error
				</div>
				<div>{message.error.message}</div>
			</div>
		);
	}
	const grouped = useMemo(() => groupContextRuns(parts), [parts]);

	return (
		<div data-message-id={message.id} className="my-2 space-y-1">
			{grouped.map((entry, idx) => {
				if (entry.kind === "single") {
					return (
						<div key={entry.part.id}>
							{renderPart(entry.part, message, streaming)}
						</div>
					);
				}
				// Key stable across re-renders by joining the run's part ids.
				const groupKey = entry.parts.map((p) => p.id).join(":") || `g${idx}`;
				return (
					<ContextGroupCard
						key={groupKey}
						parts={entry.parts}
						message={message}
					/>
				);
			})}
		</div>
	);
}
