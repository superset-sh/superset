import { useLingui } from "@lingui/react/macro";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Redirect, Stack, usePathname } from "expo-router";
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

	const { t } = useLingui();
	const { data: session } = useSession();
	const pathname = usePathname();

	// Unpaid sessions may only see home (which renders the paywall), the
	// organizations sheet, and settings — App Review requires sign-out, org
	// switching, and account deletion to stay reachable behind a gate, and that
	// sheet is the only route to all three. Leaving it out sealed unpaid
	// accounts in: it mounted and was redirected away in the same frame.
	const unpaid = !!session && !session.session.plan;
	if (
		unpaid &&
		pathname !== "/" &&
		pathname !== "/organizations" &&
		!pathname.startsWith("/settings")
	) {
		return <Redirect href="/(authenticated)/(home)" />;
	}

	return (
		<Stack screenOptions={{ headerShown: false }}>
			{/* Root headers are hidden — `title` here only names routes in
			    back-button long-press menus (otherwise raw route names leak,
			    e.g. "(home)"). */}
			<Stack.Screen name="(home)" options={{ title: t({ message: "Home" }) }} />
			<Stack.Screen
				name="settings/index"
				options={settingsScreenOptions(t({ message: "Settings" }))}
			/>
			<Stack.Screen
				name="settings/organization"
				options={settingsScreenOptions(t({ message: "Organization" }))}
			/>
			<Stack.Screen
				name="settings/hosts"
				options={settingsScreenOptions(t({ message: "Hosts" }))}
			/>
			<Stack.Screen
				name="workspace/[id]/index"
				options={{
					headerShown: true,
					headerBackButtonDisplayMode: "minimal",
					headerShadowVisible: false,
					title: t({ message: "Workspace" }),
				}}
			/>
			<Stack.Screen
				name="workspace/[id]/files-changed"
				options={{
					headerShown: true,
					headerBackButtonDisplayMode: "minimal",
					headerShadowVisible: false,
					title: t({
						message: "Files changed",
					}),
					// The one screen that has to keep this. Its code panes scroll
					// sideways on a PanResponder, and the system gesture beats a JS
					// responder every time — with the swipe on, a drag across a diff
					// pops the screen instead of scrolling it. The cost is that iOS 26
					// leaves this screen with no back swipe at all; a real horizontal
					// ScrollView would earn it back, since UIKit defers to those.
					fullScreenGestureEnabled: false,
				}}
			/>
			<Stack.Screen
				name="workspace/[id]/file"
				options={{ ...glassHeaderOptions, title: "" }}
			/>
			<Stack.Screen
				name="workspace/[id]/commits"
				options={{
					presentation: "formSheet",
					sheetAllowedDetents: [0.75],
					sheetGrabberVisible: true,
					...glassHeaderOptions,
					title: t({ message: "Commits" }),
				}}
			/>
			<Stack.Screen
				name="workspace/[id]/line-comment"
				options={{
					presentation: "formSheet",
					sheetAllowedDetents: [0.75],
					sheetGrabberVisible: true,
					...glassHeaderOptions,
					title: t({
						message: "Add comment",
					}),
				}}
			/>
			<Stack.Screen
				name="workspace/[id]/finish-review"
				options={{
					presentation: "formSheet",
					sheetAllowedDetents: [0.75],
					sheetGrabberVisible: true,
					...glassHeaderOptions,
					title: t({
						message: "Finish review",
					}),
				}}
			/>
			<Stack.Screen
				name="workspace/[id]/actions"
				options={{
					presentation: "formSheet",
					sheetAllowedDetents: [0.65],
					sheetGrabberVisible: true,
					// The workspace name is the sheet's own centred headline, so
					// the bar carries no title — only the native close button.
					...glassHeaderOptions,
					title: "",
				}}
			/>
			<Stack.Screen
				name="workspace/[id]/sessions"
				options={{
					presentation: "formSheet",
					sheetAllowedDetents: [0.5],
					sheetGrabberVisible: true,
					...glassHeaderOptions,
					title: t({ message: "Sessions" }),
				}}
			/>
			<Stack.Screen
				name="workspace/[id]/new-session"
				options={{
					presentation: "formSheet",
					sheetAllowedDetents: [0.5],
					sheetGrabberVisible: true,
					...glassHeaderOptions,
					title: t({
						message: "New session",
					}),
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
					title: t({
						message: "Pull request",
					}),
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
					title: t({
						message: "Jump to file",
					}),
				}}
			/>
		</Stack>
	);
}
