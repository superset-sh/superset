import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Redirect, Stack, usePathname } from "expo-router";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { usePrimeRelayUrl } from "@/hooks/usePrimeRelayUrl";
import { useSession } from "@/lib/auth/client";

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
	usePrimeRelayUrl();

	const { data: session } = useSession();
	const pathname = usePathname();

	// Unpaid sessions may only see home (which renders the paywall) and
	// settings — App Review requires sign-out, org switching, and account
	// deletion to stay reachable behind a gate.
	const unpaid = !!session && !session.session.plan;
	if (unpaid && pathname !== "/" && !pathname.startsWith("/settings")) {
		return <Redirect href="/(authenticated)/(home)" />;
	}

	return (
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
					name="settings/organization"
					options={settingsScreenOptions("Organization")}
				/>
				<Stack.Screen
					name="settings/hosts"
					options={settingsScreenOptions("Hosts")}
				/>
				<Stack.Screen
					name="workspace/[id]/index"
					options={{
						headerShown: true,
						headerBackButtonDisplayMode: "minimal",
						headerShadowVisible: false,
						title: "Workspace",
						fullScreenGestureEnabled: false,
					}}
				/>
				<Stack.Screen
					name="workspace/[id]/files-changed"
					options={{
						headerShown: true,
						headerBackButtonDisplayMode: "minimal",
						headerShadowVisible: false,
						title: "Files changed",
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
					name="workspace/[id]/actions"
					options={{
						presentation: "formSheet",
						sheetAllowedDetents: [0.65],
						sheetGrabberVisible: true,
						headerShown: false,
					}}
				/>
				<Stack.Screen
					name="workspace/[id]/sessions"
					options={{
						presentation: "formSheet",
						sheetAllowedDetents: [0.5],
						sheetGrabberVisible: true,
						...glassHeaderOptions,
						title: "Sessions",
					}}
				/>
				<Stack.Screen
					name="workspace/[id]/new-session"
					options={{
						presentation: "formSheet",
						sheetAllowedDetents: [0.5],
						sheetGrabberVisible: true,
						...glassHeaderOptions,
						title: "New session",
					}}
				/>
				<Stack.Screen
					name="workspace/[id]/pull-requests"
					options={{
						presentation: "formSheet",
						sheetAllowedDetents: [0.5],
						sheetGrabberVisible: true,
						...glassHeaderOptions,
					}}
				/>
				<Stack.Screen
					name="workspace/[id]/pull-request/[pullRequestId]/index"
					options={{
						...glassHeaderOptions,
						title: "Pull request",
						fullScreenGestureEnabled: false,
					}}
				/>
				<Stack.Screen
					name="workspace/[id]/pull-request/[pullRequestId]/checks"
					options={{
						presentation: "formSheet",
						sheetAllowedDetents: [0.75],
						sheetGrabberVisible: true,
						...glassHeaderOptions,
					}}
				/>
				<Stack.Screen
					name="workspace/[id]/pull-request/[pullRequestId]/reviewers"
					options={{
						presentation: "formSheet",
						sheetAllowedDetents: [0.5],
						sheetGrabberVisible: true,
						...glassHeaderOptions,
					}}
				/>
				<Stack.Screen
					name="workspace/[id]/pull-request/[pullRequestId]/check"
					options={{
						presentation: "formSheet",
						sheetAllowedDetents: [0.6],
						sheetGrabberVisible: true,
						...glassHeaderOptions,
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
	);
}
