import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Stack } from "expo-router";

/**
 * Modern glass header: on iOS 26+ the bar is fully transparent (the back
 * button floats as a Liquid Glass circle) with the per-session title rendered
 * as a floating GlassHeaderTitle pill from the thread screen. Older iOS keeps
 * the blurred material so content scrolling underneath stays legible.
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
	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen name="[sessionId]" options={glassHeaderOptions} />
			<Stack.Screen name="acp/index" options={{ title: "Live sessions" }} />
			{/* ACP threads share the exact same glass header treatment. */}
			<Stack.Screen name="acp/[sessionId]" options={glassHeaderOptions} />
		</Stack>
	);
}
