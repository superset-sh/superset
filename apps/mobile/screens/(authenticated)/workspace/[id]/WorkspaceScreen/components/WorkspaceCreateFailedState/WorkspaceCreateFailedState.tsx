import { Trans } from "@lingui/react/macro";
import { CircleAlert } from "lucide-react-native";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export function WorkspaceCreateFailedState({
	subtitle,
	errorMessage,
	prompt,
	onRetry,
	onDismiss,
}: {
	/** `projectName · branchLabel` — the two things the user chose. */
	subtitle: string;
	errorMessage: string;
	/** First line shown in the chip; retry re-sends it verbatim. */
	prompt: string;
	onRetry: () => void;
	onDismiss: () => void;
}) {
	return (
		<View className="flex-1 items-center justify-center px-8">
			<View className="border-red-500 size-9 items-center justify-center rounded-full border-[1.5px]">
				<CircleAlert size={18} color="#ef4444" strokeWidth={2} />
			</View>
			<Text className="mt-3.5 font-semibold text-[17px]">
				<Trans>Couldn't create workspace</Trans>
			</Text>
			<Text className="text-muted-foreground mt-1.5 font-mono text-xs">
				{subtitle}
			</Text>
			<View className="border-red-500/25 bg-red-500/5 mt-6 self-stretch rounded-lg border px-3.5 py-3">
				<Text
					selectable
					className="text-red-500/90 font-mono text-[11px] leading-4"
				>
					{errorMessage}
				</Text>
			</View>
			{prompt ? (
				<View className="bg-secondary/40 border-border mt-3.5 flex-row items-center gap-2 self-stretch rounded-lg border px-3 py-2.5">
					<Text className="text-muted-foreground/70 font-mono text-[9px] uppercase tracking-widest">
						<Trans>Prompt</Trans>
					</Text>
					<Text
						className="text-muted-foreground flex-1 text-xs"
						numberOfLines={1}
					>
						{prompt}
					</Text>
				</View>
			) : null}
			<View className="mt-6 flex-row gap-2.5">
				<Button size="sm" onPress={onRetry}>
					<Text>
						<Trans>Try again</Trans>
					</Text>
				</Button>
				<Button variant="secondary" size="sm" onPress={onDismiss}>
					<Text>
						<Trans>Back to Home</Trans>
					</Text>
				</Button>
			</View>
		</View>
	);
}
