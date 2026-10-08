import { getInitials } from "@superset/shared/names";
import { Image } from "expo-image";
import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

type GranteeAvatarProps =
	| { kind: "person"; name: string; image: string | null }
	| { kind: "icon"; icon: LucideIcon; dashed?: boolean };

export function GranteeAvatar(props: GranteeAvatarProps) {
	if (props.kind === "person") {
		return (
			<View className="bg-muted size-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
				{props.image ? (
					<Image
						source={{ uri: props.image }}
						style={{ height: "100%", width: "100%" }}
						contentFit="cover"
					/>
				) : (
					<Text className="text-muted-foreground text-[11px] font-medium">
						{getInitials(props.name) || "?"}
					</Text>
				)}
			</View>
		);
	}
	return (
		<View
			className={
				props.dashed
					? "border-muted-foreground/60 size-9 shrink-0 items-center justify-center rounded-full border border-dashed"
					: "bg-muted size-9 shrink-0 items-center justify-center rounded-lg"
			}
		>
			<Icon as={props.icon} className="text-muted-foreground size-4" />
		</View>
	);
}
