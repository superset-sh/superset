import { useLingui } from "@lingui/react/macro";
import type { SharePerson } from "@superset/shared/sharing";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { GranteeAvatar } from "../../../components/GranteeAvatar";

export function OwnerRow({
	owner,
	isYou,
}: {
	owner: SharePerson;
	isYou: boolean;
}) {
	const { t } = useLingui();
	return (
		<View className="min-h-14 flex-row items-center gap-3 py-2">
			<GranteeAvatar kind="person" name={owner.name} image={owner.image} />
			<View className="min-w-0 flex-1">
				<Text className="text-base" numberOfLines={1}>
					{owner.name}
					{isYou ? (
						<Text className="text-muted-foreground text-base">{` ${t({ message: "(you)" })}`}</Text>
					) : null}
				</Text>
				<Text className="text-muted-foreground text-sm" numberOfLines={1}>
					{t({ message: "Owner" })}
				</Text>
			</View>
		</View>
	);
}
