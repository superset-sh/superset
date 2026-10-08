import { useLingui } from "@lingui/react/macro";
import { Stack } from "expo-router";
import { glassHeaderOptions, sheetDetents } from "@/lib/navigation";

const accessSheetOptions = {
	presentation: "formSheet",
	sheetAllowedDetents: sheetDetents([0.45]),
	sheetGrabberVisible: true,
} as const;

export default function PageShareLayout() {
	const { t } = useLingui();

	return (
		<Stack screenOptions={glassHeaderOptions}>
			<Stack.Screen
				name="index"
				options={{ title: t({ message: "Share page" }) }}
			/>
			<Stack.Screen
				name="invite"
				options={{ title: t({ message: "Invite" }) }}
			/>
			<Stack.Screen name="permission" />
			<Stack.Screen name="access" options={accessSheetOptions} />
			<Stack.Screen name="general" options={accessSheetOptions} />
		</Stack>
	);
}
