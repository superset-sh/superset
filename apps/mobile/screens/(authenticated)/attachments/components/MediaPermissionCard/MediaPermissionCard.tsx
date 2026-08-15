import type * as MediaLibrary from "expo-media-library/legacy";
import { Linking, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/**
 * Photo-access denied state: prompts again while iOS still allows it,
 * otherwise routes to Settings.
 */
export function MediaPermissionCard({
	permission,
	onRequest,
	message,
}: {
	permission: MediaLibrary.PermissionResponse;
	onRequest: () => void;
	message: string;
}) {
	const mustUseSettings = !permission.canAskAgain;
	return (
		<View className="mx-5 items-center gap-3 rounded-xl bg-secondary px-4 py-5">
			<Text className="text-center text-secondary-foreground text-sm">
				{message}
			</Text>
			<Button
				size="sm"
				variant="outline"
				className="rounded-full"
				onPress={() => {
					if (mustUseSettings) {
						void Linking.openSettings();
						return;
					}
					onRequest();
				}}
			>
				<Text>{mustUseSettings ? "Open Settings" : "Continue"}</Text>
			</Button>
		</View>
	);
}
