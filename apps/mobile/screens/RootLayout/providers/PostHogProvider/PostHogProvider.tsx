import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	PostHogProvider as PHProvider,
	usePostHog,
} from "posthog-react-native";
import { type ReactNode, useEffect } from "react";
import { posthogConfig } from "@/lib/posthog";

interface PostHogProviderProps {
	children: ReactNode;
}

function PostHogInitializer({ children }: { children: ReactNode }) {
	const posthog = usePostHog();

	useEffect(() => {
		if (posthogConfig.options.debug) {
			posthog.debug(true);
		}
		posthog.register({
			app_name: "mobile",
		});
	}, [posthog]);

	return <>{children}</>;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
	return (
		<PHProvider
			apiKey={posthogConfig.apiKey}
			options={{
				host: posthogConfig.host,
				enableSessionReplay: posthogConfig.options.enableSessionReplay,
				customStorage: AsyncStorage,
			}}
		>
			<PostHogInitializer>{children}</PostHogInitializer>
		</PHProvider>
	);
}
