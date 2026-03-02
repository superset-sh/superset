import { usePathname } from "expo-router";
import {
	PostHogProvider as PHProvider,
	usePostHog,
} from "posthog-react-native";
import { type ReactNode, useEffect, useRef } from "react";
import { posthogConfig } from "@/lib/posthog";

interface PostHogProviderProps {
	children: ReactNode;
}

function PostHogInitializer({ children }: { children: ReactNode }) {
	const posthog = usePostHog();
	const pathname = usePathname();
	const previousPathname = useRef<string | null>(null);

	useEffect(() => {
		if (posthogConfig.options.debug) {
			posthog.debug(true);
		}
		posthog.register({
			app_name: "mobile",
		});
	}, [posthog]);

	// Track screen views on pathname change
	useEffect(() => {
		if (pathname && pathname !== previousPathname.current) {
			posthog.screen(pathname, { path: pathname });
			previousPathname.current = pathname;
		}
	}, [pathname, posthog]);

	return <>{children}</>;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
	return (
		<PHProvider
			apiKey={posthogConfig.apiKey}
			options={{
				host: posthogConfig.host,
				enableSessionReplay: posthogConfig.options.enableSessionReplay,
			}}
			autocapture={{
				captureTouches: true,
			}}
		>
			<PostHogInitializer>{children}</PostHogInitializer>
		</PHProvider>
	);
}
