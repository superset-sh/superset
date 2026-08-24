import { useGlobalSearchParams, useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import { posthog } from "@/lib/posthog";
import {
	dynamicSegmentName,
	screenNameFromSegments,
} from "../../utils/screenNameFromSegments";

/**
 * expo-router names a dynamic segment after its file, so the same `[id]` means
 * different things in different routes. Only two exist, and both already have
 * a name desktop uses.
 */
const PARAM_PROPERTY: Record<string, string> = {
	id: "workspace_id",
	pullRequestId: "pull_request_id",
};

/**
 * $screen for the route pattern, with the ids that pattern stands for as
 * properties. Renders nothing and sits beside the tree rather than wrapping
 * it: search params churn on every `?tab=` change, and this must not be what
 * re-renders the app.
 */
export function PostHogScreenTracker() {
	const segments = useSegments();
	const params = useGlobalSearchParams();
	const previousScreen = useRef<string | null>(null);

	useEffect(() => {
		const screen = screenNameFromSegments(segments);
		if (screen === previousScreen.current) return;
		previousScreen.current = screen;

		const properties: Record<string, string> = { path: screen };
		for (const segment of segments) {
			const name = dynamicSegmentName(segment);
			if (!name) continue;
			const value = params[name];
			if (typeof value === "string") {
				properties[PARAM_PROPERTY[name] ?? name] = value;
			}
		}
		posthog.screen(screen, properties);
	}, [segments, params]);

	return null;
}
