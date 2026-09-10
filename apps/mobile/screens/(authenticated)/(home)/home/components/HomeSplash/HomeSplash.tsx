import { Image, View } from "react-native";

/**
 * Sits under the native splash while Home waits for content. Geometry must
 * match the expo-splash-screen plugin config in app.config.ts — any difference
 * shows as a jump at the moment the native splash hides.
 */
const MARK_WIDTH = 200;
const MARK_ASPECT = 807 / 349;

export function HomeSplash() {
	return (
		<View className="flex-1 items-center justify-center bg-background">
			<Image
				source={require("@/assets/splash-mark.png")}
				style={{ width: MARK_WIDTH, height: MARK_WIDTH / MARK_ASPECT }}
				resizeMode="contain"
			/>
		</View>
	);
}
