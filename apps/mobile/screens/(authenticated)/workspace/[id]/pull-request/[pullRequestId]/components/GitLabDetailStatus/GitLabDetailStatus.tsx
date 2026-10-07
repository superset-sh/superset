import { Trans, useLingui } from "@lingui/react/macro";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
export function GitLabDetailStatus({
	loading,
	message,
	onRetry,
	canRetry,
	onGoBack,
}: {
	loading: boolean;
	message?: string;
	onRetry: () => void;
	canRetry: boolean;
	onGoBack?: () => void;
}) {
	const { t } = useLingui();
	return (
		<View className="bg-background flex-1 items-center justify-center gap-5 px-10">
			{loading ? (
				<>
					<ActivityIndicator />
					<Text>
						<Trans>Loading</Trans>
					</Text>
				</>
			) : (
				<>
					<Text className="text-muted-foreground text-center text-[15px]">
						{message ??
							t({
								message:
									"Could not load this merge request. Reconnect to its host and try again.",
							})}
					</Text>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t({ message: "Retry" })}
						disabled={!canRetry}
						onPress={onRetry}
						className="bg-secondary rounded-md px-5 py-2"
					>
						<Text>
							<Trans>Retry</Trans>
						</Text>
					</Pressable>
					{onGoBack ? (
						<Pressable accessibilityRole="button" onPress={onGoBack}>
							<Text>
								<Trans>Go back</Trans>
							</Text>
						</Pressable>
					) : null}
				</>
			)}
		</View>
	);
}
