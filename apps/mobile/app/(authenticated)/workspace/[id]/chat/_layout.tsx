import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Text } from "@/components/ui/text";

/**
 * Modern glass header: on iOS 26+ the bar is fully transparent (the back
 * button floats as a Liquid Glass circle) with the per-session title rendered
 * as a floating GlassHeaderTitle pill from the thread screen. Older iOS has no
 * floating-glass affordance, so the bar keeps the blurred material — otherwise
 * content scrolls under an invisible header and turns illegible.
 * headerTransparent makes the screen content full-bleed (top y=0), which is
 * why the thread's KeyboardAvoidingView uses offset 0.
 */
const glassHeaderOptions = {
	title: "",
	headerTransparent: true,
	...(isLiquidGlassAvailable()
		? {}
		: { headerBlurEffect: "systemUltraThinMaterial" as const }),
	headerStyle: { backgroundColor: "transparent" },
} as const;

export default function WorkspaceChatLayout() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen
				name="index"
				options={{
					title: "Chats",
					// Live (ACP) sessions live on a forked list screen, not mixed
					// into the mastra chat list — this is the only entry point. A
					// static link costs nothing for hosts with the feature off; the
					// ACP screen itself probes and explains when it's disabled.
					headerRight: () => (
						<Link href={`/(authenticated)/workspace/${id}/chat/acp`}>
							<Text className="text-primary">Live</Text>
						</Link>
					),
				}}
			/>
			<Stack.Screen name="acp/index" options={{ title: "Live sessions" }} />
			<Stack.Screen name="[sessionId]" options={glassHeaderOptions} />
			{/* ACP threads share the exact same glass header treatment. */}
			<Stack.Screen name="acp/[sessionId]" options={glassHeaderOptions} />
		</Stack>
	);
}
