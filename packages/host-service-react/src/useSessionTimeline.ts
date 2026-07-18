import type { SessionEvent } from "@superset/host-service-sync/protocol";
import {
	emptyTimeline,
	foldTimeline,
	type Timeline,
} from "@superset/host-service-sync/timeline";
import { useMemo, useRef } from "react";
import { useSessionStream } from "./hooks";

interface TimelineCache {
	sessionId: string;
	eventIds: readonly string[];
	timeline: Timeline;
}

/**
 * The session's ordered events folded into renderable timeline items.
 * Folds incrementally: an appended tail (the streaming common case) folds
 * only the new events; any prefix change (older-page prepend, reset replace)
 * re-folds from scratch. Subscribe separately via useRetainSession — this
 * hook only reads.
 */
export function useSessionTimeline(sessionId: string): Timeline {
	const stream = useSessionStream(sessionId);
	const cache = useRef<TimelineCache | null>(null);
	const eventIds = stream?.eventIds;
	const eventsById = stream?.eventsById;
	return useMemo(() => {
		if (eventIds === undefined || eventsById === undefined) {
			cache.current = null;
			return emptyTimeline();
		}
		const events = eventIds
			.map((id) => eventsById[id])
			.filter((event): event is SessionEvent => event !== undefined);
		const previous = cache.current;
		const isAppend =
			previous !== null &&
			previous.sessionId === sessionId &&
			events.length >= previous.eventIds.length &&
			(previous.eventIds.length === 0 ||
				(eventIds[0] === previous.eventIds[0] &&
					eventIds[previous.eventIds.length - 1] ===
						previous.eventIds[previous.eventIds.length - 1]));
		const base = isAppend ? previous.timeline : emptyTimeline();
		const timeline = foldTimeline(base, events);
		cache.current = { sessionId, eventIds, timeline };
		return timeline;
	}, [sessionId, eventIds, eventsById]);
}
