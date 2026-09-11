import Ionicons from "@expo/vector-icons/Ionicons";
import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { openUrl } from "@/lib/open-url";

interface UpdateRequiredScreenProps {
	message: string;
	currentVersion: string;
	minimumVersion: string;
}

export function UpdateRequiredScreen({
	message,
	currentVersion,
	minimumVersion,
}: UpdateRequiredScreenProps) {
	const theme = useTheme();

	useEffect(() => {
		void SplashScreen.hideAsync().catch(() => {});
	}, []);

	return (
		<View className="flex-1 items-center justify-center gap-6 bg-background p-6">
			<View
				className="size-16 items-center justify-center rounded-full"
				style={{ backgroundColor: theme.muted }}
			>
				<Ionicons name="arrow-up-circle" size={40} color={theme.primary} />
			</View>

			<View className="items-center gap-2">
				<Text className="text-2xl font-semibold text-foreground">
					<Trans>Update Required</Trans>
				</Text>
				<Text className="text-center text-base text-muted-foreground">
					{message}
				</Text>
			</View>

			<View className="items-center gap-1">
				<Text className="text-sm text-muted-foreground">
					<Trans>Your version: {currentVersion}</Trans>
				</Text>
				<Text className="text-sm text-muted-foreground">
					<Trans>Required version: {minimumVersion}+</Trans>
				</Text>
			</View>

			<Button
				size="lg"
				className="w-4/5"
				onPress={() => openUrl(COMPANY.APP_STORE_URL)}
			>
				<Text>
					<Trans>Update in the App Store</Trans>
				</Text>
			</Button>
		</View>
	);
}
