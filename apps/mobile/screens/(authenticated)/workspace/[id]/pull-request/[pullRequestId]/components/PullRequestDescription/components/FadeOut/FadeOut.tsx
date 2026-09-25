import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";

/** Blurs and fades clamped content into the page rather than cutting it mid-word. */
export function FadeOut({ height }: { height: number }) {
	const theme = useTheme();
	return (
		<View
			pointerEvents="none"
			style={{ position: "absolute", left: 0, right: 0, bottom: 0, height }}
		>
			<MaskedView
				maskElement={
					<LinearGradient
						colors={["transparent", "black"]}
						style={StyleSheet.absoluteFill}
					/>
				}
				style={StyleSheet.absoluteFill}
			>
				<BlurView intensity={40} style={StyleSheet.absoluteFill} tint="dark" />
			</MaskedView>
			<LinearGradient
				colors={["transparent", theme.background]}
				style={StyleSheet.absoluteFill}
			/>
		</View>
	);
}
