import { Image, View } from "react-native";

/**
 * Shown while Home waits for content. Matches the sign-in screen's mark, and
 * deliberately not `splash-icon.png` — that bakes in a #151110 ground which
 * would seam against the app background rather than blend.
 */
export function HomeSplash() {
	return (
		<View className="flex-1 items-center justify-center bg-background">
			<Image
				source={require("@/assets/icon.png")}
				style={{ width: 80, height: 80, borderRadius: 16 }}
			/>
		</View>
	);
}
