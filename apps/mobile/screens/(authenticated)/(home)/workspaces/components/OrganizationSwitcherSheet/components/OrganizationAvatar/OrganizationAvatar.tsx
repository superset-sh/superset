import { Image, View } from "react-native";
import { Text } from "@/components/ui/text";

export function OrganizationAvatar({
	name,
	logo,
	size,
}: {
	name?: string | null;
	logo?: string | null;
	size: number;
}) {
	if (logo) {
		return (
			<Image
				source={{ uri: logo }}
				style={{ width: size, height: size, borderRadius: 12 }}
			/>
		);
	}

	const initial = (name ?? "O").charAt(0).toUpperCase();
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: 12,
				backgroundColor: "rgba(120,120,128,0.2)",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Text
				style={{
					fontSize: size * 0.45,
					fontWeight: "700",
					color: "rgba(60,60,67,0.6)",
				}}
			>
				{initial}
			</Text>
		</View>
	);
}
