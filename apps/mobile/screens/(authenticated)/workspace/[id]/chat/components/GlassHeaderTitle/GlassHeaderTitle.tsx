import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

const GLASS = isLiquidGlassAvailable();

/**
 * Floating glass title pill for the chat thread headers. The nav bar itself is
 * fully transparent (no full-width blur bar — iOS 26 renders the back button
 * as a floating Liquid Glass circle), so the title carries its own glass
 * surface, matching the composer's material. Solid card pill as fallback on
 * older iOS / Android / Reduce Transparency.
 */
export function GlassHeaderTitle({ title }: { title: string | null }) {
	if (!title) return null;
	const label = (
		<Text
			className="max-w-56 font-medium text-foreground text-sm"
			numberOfLines={1}
		>
			{title}
		</Text>
	);
	if (!GLASS) {
		return (
			<View className="rounded-full border border-border bg-card px-3 py-1.5">
				{label}
			</View>
		);
	}
	return (
		<GlassView
			// Dark-pinned to avoid the glass-material theme-toggle bug (expo #43743);
			// the app is dark-only.
			colorScheme="dark"
			glassEffectStyle="regular"
			style={{ borderRadius: 999, overflow: "hidden" }}
		>
			<View className="px-3 py-1.5">{label}</View>
		</GlassView>
	);
}
