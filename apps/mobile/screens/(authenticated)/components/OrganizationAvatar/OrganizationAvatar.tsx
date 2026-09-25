import { Image } from "expo-image";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

export function OrganizationAvatar({
	name,
	logo,
	size,
}: {
	name?: string | null;
	logo?: string | null;
	size: number;
}) {
	const theme = useTheme();

	if (logo) {
		return (
			<View
				className="overflow-hidden rounded-md border border-foreground/10 bg-muted"
				style={{ width: size, height: size }}
			>
				<Image
					source={{ uri: logo }}
					style={{ width: "100%", height: "100%" }}
				/>
			</View>
		);
	}

	const initial = (name ?? "O").charAt(0).toUpperCase();
	return (
		<View
			className="items-center justify-center rounded-md border border-foreground/10 bg-muted"
			style={{ width: size, height: size }}
		>
			<Text
				className="font-bold"
				style={{
					fontSize: size * 0.45,
					lineHeight: size,
					width: size,
					textAlign: "center",
					color: theme.mutedForeground,
				}}
			>
				{initial}
			</Text>
		</View>
	);
}
