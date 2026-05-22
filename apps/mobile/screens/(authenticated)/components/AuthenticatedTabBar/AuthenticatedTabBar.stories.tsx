import type { Meta, StoryObj } from "@storybook/react-native";
import { Platform, View } from "react-native";
import { Text } from "@/components/ui/text";

/**
 * The real `AuthenticatedTabBar` mounts a `TabBarView` from `@superset/tab-bar`
 * — a SwiftUI-bridged native tab bar — driven by `expo-router/ui` hooks
 * (`useTabTrigger`, `useRouter`) and the `useOrganizations` collection query.
 * None of those render in Storybook isolation:
 *
 *  - `TabBarView` is a native bridge that needs the live navigation host
 *  - `useTabTrigger` requires an active expo-router Tabs context
 *  - `useOrganizations` queries the Electric collection provider
 *
 * This story is a **dependency-acknowledgement placeholder** — it documents
 * the integration surface and points to the running app for visual verification.
 * The audit target is purely layout (StyleSheet.create with `position: absolute`
 * + `height: 96`); no token consumption locally. Per screens/AUDIT.md (CLEAN).
 */
function AuthenticatedTabBarPlaceholder() {
	return (
		<View className="bg-card border-border rounded-lg border p-4 gap-3">
			<Text className="font-semibold">AuthenticatedTabBar</Text>
			<Text variant="muted" className="text-xs">
				Native tab bar — verified in running app, not in Storybook isolation.
			</Text>
			<View className="bg-muted h-px" />
			<View className="gap-2">
				<Text variant="small">
					Dependencies that prevent isolation rendering:
				</Text>
				<Text variant="muted" className="text-xs">
					· `@superset/tab-bar` TabBarView (SwiftUI bridge)
				</Text>
				<Text variant="muted" className="text-xs">
					· `useTabTrigger` from expo-router/ui (requires Tabs context)
				</Text>
				<Text variant="muted" className="text-xs">
					· `useOrganizations` (Electric collection query)
				</Text>
			</View>
			<View className="bg-muted h-px" />
			<View className="gap-1">
				<Text variant="small">Local audit surface (StyleSheet):</Text>
				<Text variant="muted" className="text-xs">
					· `position: 'absolute'` · `height: 96` · no color literals
				</Text>
				<Text variant="muted" className="text-xs">
					Token-clean per screens/AUDIT.md — no remediation needed.
				</Text>
			</View>
			<Text variant="muted" className="text-xs">
				Platform.OS = {Platform.OS}
			</Text>
		</View>
	);
}

const meta: Meta<typeof AuthenticatedTabBarPlaceholder> = {
	title: "Components/AuthenticatedTabBar",
	component: AuthenticatedTabBarPlaceholder,
	parameters: {
		docs: {
			description: {
				component:
					"Authenticated bottom tab bar wrapping `@superset/tab-bar` TabBarView (SwiftUI bridge). **Not renderable in Storybook isolation** — the native tab bar and expo-router context can only be exercised in the running app. This placeholder documents the integration surface; token audit (CLEAN) is in screens/AUDIT.md.",
			},
		},
	},
};

export default meta;

type Story = StoryObj<typeof AuthenticatedTabBarPlaceholder>;

export const Placeholder: Story = {};
