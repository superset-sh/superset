/**
 * Phase 2 Timeline — maps derived rows to components. Auto-scroll
 * (Phase 2.5) keeps the view pinned to the bottom while the session is
 * busy and offers a jump-to-latest pill when the user has scrolled up.
 * Windowing + staging ship in a later Phase 2.5 follow-up.
 *
 * Plan reference: 20260421-v2-chat-refactor-phased-plan.md §2.
 */

import { useMemo } from "react";
import { useChatStore } from "../../../../store";
import { selectStatus, selectTurns } from "../../../../store/selectors";
import { useAutoScroll } from "../../hooks/useAutoScroll/useAutoScroll";
import { JumpToBottomButton } from "./JumpToBottomButton";
import { deriveTimelineRows } from "./Timeline.logic";
import { AssistantParts } from "./Turn/AssistantParts";
import { ThinkingIndicator } from "./Turn/ThinkingIndicator";
import { UserTurnHeader } from "./Turn/UserTurnHeader";

export interface TimelineProps {
	sessionId: string;
}

export function Timeline({ sessionId }: TimelineProps) {
	const status = useChatStore((s) => selectStatus(s, sessionId));
	// Derive the "active user message" — the latest user id when the
	// session is busy. This makes `turn.active` fire in selectTurns so
	// the Timeline emits a "Thinking…" row for the in-flight turn.
	const activeUserMessageId = useChatStore((s) => {
		if (status.type === "idle") return undefined;
		const list = s.messages[sessionId];
		if (!list) return undefined;
		for (let i = list.length - 1; i >= 0; i -= 1) {
			const m = list[i];
			if (m?.role === "user") return m.id;
		}
		return undefined;
	});
	const turns = useChatStore((s) =>
		selectTurns(s, sessionId, activeUserMessageId),
	);
	const historyMore = useChatStore((s) => s.historyMore[sessionId] ?? false);
	const historyLoading = useChatStore(
		(s) => s.historyLoading[sessionId] ?? false,
	);

	const rows = useMemo(
		() =>
			deriveTimelineRows({
				turns,
				status,
				historyMore,
				historyLoading,
			}),
		[turns, status, historyMore, historyLoading],
	);

	// Content signal for auto-scroll: total characters of streaming
	// text/reasoning in the active turn + message count. Changes every
	// time a delta lands, giving useAutoScroll a deterministic trigger
	// that doesn't rely on ResizeObserver catching the commit.
	const contentSignal = useMemo(() => {
		let chars = 0;
		for (const turn of turns) {
			for (const asst of turn.assistant) {
				const parts = turn.parts[asst.id] ?? [];
				for (const p of parts) {
					if (p.type === "text" || p.type === "reasoning") {
						chars += p.text.length;
					}
				}
			}
		}
		// Pack message count so inserts also tick the signal even when
		// text is empty (new tool part, dock changes, etc.).
		return chars + turns.length * 1_000_000;
	}, [turns]);

	const autoScroll = useAutoScroll({
		working: status.type !== "idle",
		contentSignal,
	});

	return (
		<div className="relative min-h-0 flex-1">
			<div
				ref={autoScroll.scrollRef}
				onScroll={autoScroll.handleScroll}
				onClick={autoScroll.handleInteraction}
				data-scrollable="true"
				className="absolute inset-0 overflow-y-auto px-4 pb-8"
			>
				<div
					ref={autoScroll.contentRef}
					className="mx-auto max-w-3xl"
				>
					{rows.map((row, idx) => {
						switch (row.kind) {
							case "empty":
								return (
									<div
										key="empty"
										className="text-muted-foreground py-16 text-center text-xs"
									>
										No messages yet.
									</div>
								);
							case "load-earlier":
								return (
									<div
										key="load-earlier"
										className="text-muted-foreground py-2 text-center text-xs"
									>
										{row.loading
											? "Loading earlier…"
											: "More history available"}
									</div>
								);
							case "turn-user":
								return (
									<UserTurnHeader
										key={row.user.id}
										user={row.user}
										parts={row.parts}
									/>
								);
							case "turn-assistant":
								return (
									<AssistantParts
										key={row.message.id}
										message={row.message}
										parts={row.parts}
										streaming={row.streaming}
									/>
								);
							case "thinking":
								return (
									<ThinkingIndicator
										key={`thinking-${row.turnIndex}-${idx}`}
									/>
								);
						}
					})}
				</div>
			</div>

			<JumpToBottomButton
				visible={autoScroll.userScrolled}
				onJump={autoScroll.resume}
			/>
		</div>
	);
}
