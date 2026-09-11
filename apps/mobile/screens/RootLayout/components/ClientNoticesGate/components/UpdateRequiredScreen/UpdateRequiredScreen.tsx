import Ionicons from "@expo/vector-icons/Ionicons";
import { Trans } from "@lingui/react/macro";
import type { DesktopNotice } from "@superset/shared/desktop-notices";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { View } from "react-native";
import { StreamdownText } from "react-native-streamdown";
import { MESSAGE_MARKDOWN_STYLE } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

interface UpdateRequiredScreenProps {
	notice: DesktopNotice;
	currentVersion: string;
	onCta: () => void;
}

export function UpdateRequiredScreen({
	notice,
	currentVersion,
	onCta,
}: UpdateRequiredScreenProps) {
	const theme = useTheme();
	const minimumVersion = notice.minVersion;

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
				<StreamdownText
					markdown={notice.body}
					markdownStyle={MESSAGE_MARKDOWN_STYLE}
				/>
			</View>

			<View className="items-center gap-1">
				<Text className="text-sm text-muted-foreground">
					<Trans>Your version: {currentVersion}</Trans>
				</Text>
				{minimumVersion && (
					<Text className="text-sm text-muted-foreground">
						<Trans>Required version: {minimumVersion}+</Trans>
					</Text>
				)}
			</View>

			{notice.cta && (
				<Button size="lg" className="w-4/5" onPress={onCta}>
					<Text>{notice.cta.label}</Text>
				</Button>
			)}
		</View>
	);
}
