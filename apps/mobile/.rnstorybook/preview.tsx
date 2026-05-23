import { PortalHost } from "@rn-primitives/portal";
import type { Preview } from "@storybook/react-native";
import { NavigationContainer } from "expo-router/react-navigation";
import { View } from "react-native";

// Provides UnhandledLinkingContext + LinkingContext + the base
// NavigationContainer state so any story that transitively imports a
// component using `useRouter`, `useNavigation`, `useLocalSearchParams`,
// etc. (e.g. screen stories) can render without crashing with
// "Couldn't find an UnhandledLinkingContext context."
// expo-router builds on @react-navigation/native, which is sufficient for
// the contexts most chat/screen components consume during Storybook prep.
const preview: Preview = {
	decorators: [
		(Story) => (
			<NavigationContainer>
				<View className="flex-1 bg-background p-4">
					<Story />
					<PortalHost />
				</View>
			</NavigationContainer>
		),
	],
	parameters: {
		controls: {
			matchers: {
				color: /(background|color|foreground)$/i,
				date: /Date$/i,
			},
		},
	},
};

export default preview;
