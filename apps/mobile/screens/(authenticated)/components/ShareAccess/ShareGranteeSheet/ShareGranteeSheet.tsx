import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { ShareGrantee, ShareRoleOption } from "@superset/shared/sharing";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { Alert, ScrollView } from "react-native";
import { Icon } from "@/components/ui/icon";
import { ListRow } from "../../ListRow";
import { ListRowCheck } from "../../ListRowCheck";

/** One person's, team's or invite's access: pick a role, or take access away. */
export function ShareGranteeSheet({
	grantee,
	roles,
	onSetRole,
	onRemove,
}: {
	grantee: ShareGrantee | undefined;
	roles: ShareRoleOption[];
	/** Absent where there is only one role. */
	onSetRole?: (role: string) => Promise<unknown>;
	onRemove: () => Promise<unknown>;
}) {
	const { t } = useLingui();
	const router = useRouter();
	const name = grantee
		? grantee.kind === "invitation"
			? grantee.email
			: grantee.name
		: "";
	const current = roles.find((role) => role.id === grantee?.role) ?? roles[0];

	const run = (action: () => Promise<unknown>, fallback: string) => {
		action().then(
			() => router.back(),
			(error: unknown) => Alert.alert(errorMessage(error, fallback)),
		);
	};

	return (
		<>
			<Stack.Screen options={{ title: name }} />
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel={t({ message: "Close" })}
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<ScrollView
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="px-4 pb-10 pt-2"
			>
				{grantee
					? roles.map((role) => (
							<ListRow
								key={role.id}
								label={role.label}
								subtitle={role.description}
								trailing={<ListRowCheck visible={role.id === current?.id} />}
								onPress={
									onSetRole && role.id !== current?.id
										? () => {
												void Haptics.impactAsync(
													Haptics.ImpactFeedbackStyle.Light,
												);
												run(
													() => onSetRole(role.id),
													t({ message: "Could not change access" }),
												);
											}
										: undefined
								}
							/>
						))
					: null}
				{grantee ? (
					<ListRow
						icon={<Icon as={Trash2} className="text-destructive size-[18px]" />}
						label={
							grantee.kind === "invitation"
								? t({ message: "Cancel invite" })
								: t({ message: "Remove" })
						}
						destructive
						isLast
						onPress={() => {
							void Haptics.notificationAsync(
								Haptics.NotificationFeedbackType.Warning,
							);
							run(onRemove, t({ message: "Could not remove access" }));
						}}
					/>
				) : null}
			</ScrollView>
		</>
	);
}
