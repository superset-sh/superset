import { useGlobalSearchParams, useSegments } from "expo-router";
import {
	PostHogProvider as PHProvider,
	type PostHogAutocaptureOptions,
} from "posthog-react-native";
import { type ReactNode, useEffect, useRef } from "react";
import { posthog, posthogConfig } from "@/lib/posthog";

interface PostHogProviderProps {
	children: ReactNode;
}

const autocapture: PostHogAutocaptureOptions = {
	captureTouches: true,
	// expo-router never exposes the NavigationContainer the library's own screen
	// tracking needs, so PostHog documents capturing them by hand instead.
	captureScreens: false,
	// The default list ends in "children", which serialises every element's
	// rendered text into $el_text — workspace names, branches, hosts.
	propsToCapture: ["style", "testID", "accessibilityLabel", "ph-label"],
	maxElementsCaptured: 6,
};

/** The route pattern, so `/workspace/<uuid>` is one screen and not hundreds. */
function ScreenTracker() {
	const segments = useSegments();
	const { id } = useGlobalSearchParams<{ id?: string }>();
	const previous = useRef<string | null>(null);

	useEffect(() => {
		const path = segments.filter((segment) => !segment.startsWith("("));
		if (path.at(-1) === "index") path.pop();
		const screen = path.length > 0 ? `/${path.join("/")}` : "/";
		// Keyed on the pair: one workspace to another keeps the same pattern.
		const key = `${screen}:${id ?? ""}`;
		if (key === previous.current) return;
		previous.current = key;
		posthog.screen(screen, id ? { workspace_id: id } : undefined);
	}, [segments, id]);

	return null;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
	return (
		<PHProvider
			client={posthog}
			debug={posthogConfig.options.debug}
			autocapture={autocapture}
		>
			<ScreenTracker />
			{children}
		</PHProvider>
	);
}
