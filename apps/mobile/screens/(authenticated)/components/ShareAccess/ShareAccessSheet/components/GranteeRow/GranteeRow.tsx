import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { ShareGrantee, ShareRoleOption } from "@superset/shared/sharing";
import { UserPlus, Users } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { GranteeAvatar } from "../../../components/GranteeAvatar";
import { MoreButton } from "../MoreButton";

export function GranteeRow({
	grantee,
	roles,
	isYou,
	canManage,
	onPress,
}: {
	grantee: ShareGrantee;
	roles: ShareRoleOption[];
	isYou: boolean;
	canManage: boolean;
	onPress: () => void;
}) {
	const { t } = useLingui();
	const name = grantee.kind === "invitation" ? grantee.email : grantee.name;
	const roleLabel =
		(roles.find((role) => role.id === grantee.role) ?? roles[0])?.label ?? "";
	const detail =
		grantee.kind === "team"
			? `${t({
					message: plural(grantee.memberCount, {
						one: "# person",
						other: "# people",
					}),
				})} · ${roleLabel}`
			: grantee.kind === "invitation"
				? `${t({ message: "Invite pending" })} · ${roleLabel}`
				: roleLabel;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={t({ message: `Access for ${name}` })}
			accessibilityState={{ disabled: !canManage }}
			disabled={!canManage}
			onPress={onPress}
			className="min-h-14 flex-row items-center gap-3 py-2 active:opacity-60"
		>
			{grantee.kind === "user" ? (
				<GranteeAvatar
					kind="person"
					name={grantee.name}
					image={grantee.image}
				/>
			) : grantee.kind === "team" ? (
				<GranteeAvatar kind="icon" icon={Users} />
			) : (
				<GranteeAvatar kind="icon" icon={UserPlus} dashed />
			)}
			<View className="min-w-0 flex-1">
				<Text className="text-base" numberOfLines={1}>
					{name}
					{isYou ? (
						<Text className="text-muted-foreground text-base">{` ${t({ message: "(you)" })}`}</Text>
					) : null}
				</Text>
				<Text className="text-muted-foreground text-sm" numberOfLines={1}>
					{detail}
				</Text>
			</View>
			{canManage ? (
				<MoreButton
					a11yLabel={t({ message: `More options for ${name}` })}
					onPress={onPress}
				/>
			) : null}
		</Pressable>
	);
}
