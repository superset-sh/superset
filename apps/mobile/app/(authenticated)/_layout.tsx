import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Stack } from "expo-router";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { useDevicePresence } from "@/hooks/useDevicePresence";
import { CollectionsProvider } from "@/screens/(authenticated)/providers/CollectionsProvider";

const settingsScreenOptions = (title: string) => ({
	headerShown: true,
	headerBackButtonDisplayMode: "minimal" as const,
	headerShadowVisible: false,
	title,
});

const glassHeaderOptions = {
	headerShown: true,
	headerTransparent: true,
	headerLargeTitle: false,
	headerBackButtonDisplayMode: "minimal",
	headerShadowVisible: false,
	...(isLiquidGlassAvailable()
		? {}
		: { headerBlurEffect: "systemUltraThinMaterial" as const }),
	headerStyle: { backgroundColor: "transparent" },
} as const;

export default function AuthenticatedLayout() {
	useDevicePresence();

	return (
		<CollectionsProvider>
			<PromptInputProvider>
				<Stack screenOptions={{ headerShown: false }}>
					{/* Root headers are hidden — `title` here only names routes in
				    back-button long-press menus (otherwise raw route names leak,
				    e.g. "(home)"). */}
					<Stack.Screen name="(home)" options={{ title: "Home" }} />
					<Stack.Screen
						name="settings/index"
						options={settingsScreenOptions("Settings")}
					/>
					<Stack.Screen
						name="settings/account"
						options={settingsScreenOptions("Account")}
					/>
					<Stack.Screen
						name="settings/organization"
						options={settingsScreenOptions("Organization")}
					/>
					<Stack.Screen
						name="settings/hosts"
						options={settingsScreenOptions("Hosts")}
					/>
					<Stack.Screen
						name="settings/billing"
						options={settingsScreenOptions("Billing")}
					/>
					<Stack.Screen
						name="workspace/[id]/chat/[sessionId]"
						options={{ ...glassHeaderOptions, title: "Chat" }}
					/>
					<Stack.Screen
						name="workspace/[id]/chat/acp/[sessionId]"
						options={{ ...glassHeaderOptions, title: "Chat" }}
					/>
					<Stack.Screen
						name="workspace/[id]/diff"
						options={{ ...glassHeaderOptions, title: "Changes" }}
					/>
					<Stack.Screen
						name="workspace/[id]/files-changed"
						options={{
							// Solid themed header (matches the sticky file bars), not glass.
							headerShown: true,
							headerBackButtonDisplayMode: "minimal",
							headerShadowVisible: false,
							title: "Files changed",
							// Right-swipes are horizontal diff scrolling — back stays edge-only.
							fullScreenGestureEnabled: false,
						}}
					/>
					<Stack.Screen
						name="workspace/[id]/file"
						options={{
							...glassHeaderOptions,
							title: "",
							fullScreenGestureEnabled: false,
						}}
					/>
					<Stack.Screen
						name="workspace/[id]/commits"
						options={{
							presentation: "formSheet",
							sheetAllowedDetents: [0.75],
							sheetGrabberVisible: true,
							...glassHeaderOptions,
							title: "Commits",
						}}
					/>
					<Stack.Screen
						name="workspace/[id]/line-comment"
						options={{
							presentation: "formSheet",
							sheetAllowedDetents: [0.75],
							sheetGrabberVisible: true,
							...glassHeaderOptions,
							title: "Add comment",
						}}
					/>
					<Stack.Screen
						name="workspace/[id]/finish-review"
						options={{
							presentation: "formSheet",
							sheetAllowedDetents: [0.75],
							sheetGrabberVisible: true,
							...glassHeaderOptions,
							title: "Finish review",
						}}
					/>
					<Stack.Screen
						name="workspace/[id]/jump-to-file"
						options={{
							presentation: "formSheet",
							sheetAllowedDetents: [0.75],
							sheetGrabberVisible: true,
							...glassHeaderOptions,
							title: "Jump to file",
						}}
					/>
				</Stack>
			</PromptInputProvider>
		</CollectionsProvider>
	);
}
