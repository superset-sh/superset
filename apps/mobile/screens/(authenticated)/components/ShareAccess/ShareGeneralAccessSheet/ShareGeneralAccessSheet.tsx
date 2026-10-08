import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { ShareRoleOption } from "@superset/shared/sharing";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { Alert, ScrollView } from "react-native";
import { Icon } from "@/components/ui/icon";
import { ListRow } from "../../ListRow";
import { ListRowCheck } from "../../ListRowCheck";
import { useChooseGeneralAccess } from "../hooks/useChooseGeneralAccess";
import type { GeneralAccess } from "../types";

/**
 * General access, in two parts: `who` picks who can open it from its link,
 * `level` picks what they can do once they have.
 */
export function ShareGeneralAccessSheet({
	mode,
	general,
	roles,
}: {
	mode: "who" | "level";
	general: GeneralAccess;
	roles: ShareRoleOption[];
}) {
	const { t } = useLingui();
	const router = useRouter();
	const choose = useChooseGeneralAccess(general);
	const role = general.role;

	return (
		<>
			<Stack.Screen
				options={{
					title:
						mode === "who"
							? t({ message: "General access" })
							: t({ message: "Permission level" }),
				}}
			/>
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
				{mode === "who"
					? general.options.map((option, index) => (
							<ListRow
								key={option.value}
								icon={
									<Icon
										as={option.icon}
										className="text-foreground size-[18px]"
									/>
								}
								label={option.label}
								subtitle={option.description}
								trailing={
									<ListRowCheck visible={option.value === general.value} />
								}
								isLast={index === general.options.length - 1}
								onPress={() =>
									void choose(option.value).then((applied) => {
										if (applied) router.back();
									})
								}
							/>
						))
					: roles.map((option, index) => (
							<ListRow
								key={option.id}
								label={option.label}
								subtitle={option.description}
								trailing={<ListRowCheck visible={option.id === role?.value} />}
								isLast={index === roles.length - 1}
								onPress={() => {
									if (!role || option.id === role.value) return;
									void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
									role.onChange(option.id).then(
										() => router.back(),
										(error: unknown) =>
											Alert.alert(
												errorMessage(
													error,
													t({ message: "Could not change access" }),
												),
											),
									);
								}}
							/>
						))}
			</ScrollView>
		</>
	);
}
