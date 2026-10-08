import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import * as Haptics from "expo-haptics";
import { Alert } from "react-native";
import type { GeneralAccess } from "../../types";

/** Applies a general access choice, asking first when it goes public or narrows. Resolves true once applied. */
export function useChooseGeneralAccess(general: GeneralAccess) {
	const { t } = useLingui();
	return (next: string) =>
		new Promise<boolean>((resolve) => {
			if (next === general.value) {
				resolve(false);
				return;
			}
			const apply = () => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				general.onChange(next).then(
					() => resolve(true),
					(error: unknown) => {
						Alert.alert(
							errorMessage(error, t({ message: "Could not change access" })),
						);
						resolve(false);
					},
				);
			};
			const confirm = general.confirm?.(general.value, next);
			if (!confirm) {
				apply();
				return;
			}
			Alert.alert(confirm.title, confirm.message, [
				{
					style: "cancel",
					text: t({ message: "Cancel" }),
					onPress: () => resolve(false),
				},
				{
					onPress: apply,
					style: confirm.destructive ? "destructive" : "default",
					text: confirm.action,
				},
			]);
		});
}
