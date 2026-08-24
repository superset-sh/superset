import {
	PostHogProvider as PHProvider,
	type PostHogAutocaptureOptions,
} from "posthog-react-native";
import type { ReactNode } from "react";
import { posthog, posthogConfig } from "@/lib/posthog";
import { PostHogScreenTracker } from "./components/PostHogScreenTracker";

interface PostHogProviderProps {
	children: ReactNode;
}

const autocapture: PostHogAutocaptureOptions = {
	// Kept on deliberately: strip the content out of touches, don't stop
	// seeing them.
	captureTouches: true,
	// PostHogScreenTracker sends these, and it knows the route pattern rather
	// than the pathname. The library's expo-router capture never produced an
	// event here anyway.
	captureScreens: false,
	// The default list ends in 'children', which serialises each element's
	// rendered text into $el_text. What that collected in production:
	// workspace names — which are AI summaries of the user's own prompt —
	// alongside branch names, host names and teammates' names.
	propsToCapture: ["style", "testID", "accessibilityLabel", "ph-label"],
	// Walking 20 ancestors of flattened style strings is what made the average
	// captured element chain 1.2KB, 93% of them over 1KB.
	maxElementsCaptured: 6,
};

export function PostHogProvider({ children }: PostHogProviderProps) {
	return (
		<PHProvider
			client={posthog}
			debug={posthogConfig.options.debug}
			autocapture={autocapture}
		>
			<PostHogScreenTracker />
			{children}
		</PHProvider>
	);
}
