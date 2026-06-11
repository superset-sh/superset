import {
	PreviewRouteContext,
	type PreviewRouteContextType,
} from "expo-router/build/link/preview/PreviewRouteContext";
import {
	LinkingContext,
	NavigationContainer,
	NavigationContainerRefContext,
	ThemeProvider,
	UNSTABLE_UnhandledLinkingContext as UnhandledLinkingContext,
} from "expo-router/react-navigation";
import { type PropsWithChildren, useContext } from "react";
import { NAV_THEME } from "@/lib/theme";

import {
	storybookLinkingContext,
	storybookLinkingOptions,
} from "./router/LinkingContext";
import { storybookUnhandledLinkingContext } from "./router/UnhandledLinkingContext";

const storybookRoute = {
	pathname: "/storybook",
	params: {},
	segments: ["storybook"],
} satisfies PreviewRouteContextType;

export function StorybookRouterProvider({ children }: PropsWithChildren) {
	const navigationRef = useContext(NavigationContainerRefContext);

	const content = (
		<ThemeProvider value={NAV_THEME.dark}>
			<UnhandledLinkingContext.Provider
				value={storybookUnhandledLinkingContext}
			>
				<LinkingContext.Provider value={storybookLinkingContext}>
					<PreviewRouteContext.Provider value={storybookRoute}>
						{children}
					</PreviewRouteContext.Provider>
				</LinkingContext.Provider>
			</UnhandledLinkingContext.Provider>
		</ThemeProvider>
	);

	if (navigationRef) {
		return content;
	}

	return (
		<NavigationContainer
			fallback={null}
			linking={storybookLinkingOptions}
			theme={NAV_THEME.dark}
		>
			{content}
		</NavigationContainer>
	);
}
