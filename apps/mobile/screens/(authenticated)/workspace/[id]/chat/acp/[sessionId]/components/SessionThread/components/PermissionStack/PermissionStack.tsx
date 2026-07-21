import {
	makeSelectedOutcome,
	type PendingPermission,
} from "@superset/session-protocol";
import { useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import type { RespondToPermission } from "../TimelineItemView";
import { PermissionCard } from "./components/PermissionCard";

/**
 * Blocking permission asks, stacked above the composer like iOS notifications:
 * the oldest request is the front card (same side margins as the composer so
 * the edges line up), and when more are queued the next card's top edge peeks
 * out behind it. Answering dismisses the front card optimistically — the
 * resolution stays on the tool call's record in its detail sheet — and the
 * peeking card animates to the front.
 */
export function PermissionStack({
	pending,
	onRespond,
}: {
	pending: PendingPermission[];
	onRespond: RespondToPermission;
}) {
	// Dismissed the moment an option is tapped, while the response round-trips;
	// restored on failure. State eventually removes resolved entries from
	// `pending`, which prunes this set's relevance naturally.
	const [answeredIds, setAnsweredIds] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const visible = pending.filter((entry) => !answeredIds.has(entry.requestId));
	const front = visible[0];
	if (!front) return null;

	// Multi-select cards answer with every picked option (makeSelectedOutcome
	// packs the extras into the outcome's _meta); single-select passes one id.
	const answer = (requestId: string, optionIds: string[]) => {
		setAnsweredIds((prev) => new Set(prev).add(requestId));
		onRespond(requestId, makeSelectedOutcome(optionIds)).catch(() => {
			setAnsweredIds((prev) => {
				const next = new Set(prev);
				next.delete(requestId);
				return next;
			});
		});
	};

	return (
		// px-3 matches the composer wrapper's paddingHorizontal: 12.
		<View className="px-3 pb-2">
			{visible.length > 1 ? (
				<Animated.View
					entering={FadeIn.duration(150)}
					exiting={FadeOut.duration(150)}
					// The next queued card peeking out; the front card overlaps its
					// lower half so only the top edge shows.
					className="mx-3 h-3 rounded-t-2xl border border-border border-b-0 bg-card/70"
					style={{ marginBottom: -6 }}
				/>
			) : null}
			<PermissionCard key={front.requestId} pending={front} onAnswer={answer} />
		</View>
	);
}
