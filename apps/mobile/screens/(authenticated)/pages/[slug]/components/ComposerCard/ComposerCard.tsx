import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { ReactNode } from "react";
import { View } from "react-native";

export function ComposerCard({ children }: { children: ReactNode }) {
	const content = <View className="gap-2 px-4 pb-3 pt-4">{children}</View>;
	if (isLiquidGlassAvailable()) {
		return (
			<GlassView
				glassEffectStyle="regular"
				style={{ borderRadius: 28, overflow: "hidden" }}
			>
				{content}
			</GlassView>
		);
	}
	return (
		<View className="bg-secondary border-border overflow-hidden rounded-[28px] border">
			{content}
		</View>
	);
}
