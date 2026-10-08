import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Text } from "@/components/ui/text";

interface PresenceCursorProps {
	x: number;
	y: number;
	name: string;
	color: string;
}

export function PresenceCursor({ x, y, name, color }: PresenceCursorProps) {
	return (
		<View
			className="absolute top-0 left-0"
			style={{ transform: [{ translateX: x }, { translateY: y }] }}
		>
			<Svg width={13} height={20} viewBox="0 0 13 20">
				<Path
					d="M1 1v15.5l3.9-3.8 2.5 5.8 2.3-1-2.5-5.7h5.2z"
					fill="black"
					stroke="white"
					strokeWidth={1}
					strokeLinejoin="round"
				/>
			</Svg>
			<View
				className="absolute top-3.5 left-3.5 rounded-sm px-2 py-0.5"
				style={{ backgroundColor: color }}
			>
				<Text
					numberOfLines={1}
					className="max-w-40 font-medium text-xs text-white"
				>
					{name}
				</Text>
			</View>
		</View>
	);
}
