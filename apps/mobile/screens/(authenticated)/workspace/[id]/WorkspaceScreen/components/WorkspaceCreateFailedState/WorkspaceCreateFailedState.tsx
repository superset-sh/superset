import { Trans } from "@lingui/react/macro";
import { CircleAlert } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { PendingWorkspaceCreateFailure } from "@/screens/(authenticated)/stores/pendingWorkspaceCreatesStore";

export function WorkspaceCreateFailedState({
	subtitle,
	failure,
	checking,
	prompt,
	onRetry,
	onDismiss,
}: {
	/** `projectName · branchLabel` — the two things the user chose. */
	subtitle: string;
	failure: PendingWorkspaceCreateFailure;
	/** Asking the host whether an unproven create landed after all. */
	checking: boolean;
	/** First line shown in the chip; retry re-sends it verbatim. */
	prompt: string;
	onRetry: () => void;
	onDismiss: () => void;
}) {
	// An unproven failure gets the softer heading and the quieter button: the
	// worktree may exist, and creating a second one is the expensive mistake.
	const unproven = failure.outcome === "unknown";
	return (
		<View className="flex-1 items-center justify-center px-8">
			<View className="border-red-500 size-9 items-center justify-center rounded-full border-[1.5px]">
				<CircleAlert size={18} color="#ef4444" strokeWidth={2} />
			</View>
			<Text className="mt-3.5 font-semibold text-[17px]">
				{unproven ? (
					<Trans>Didn't hear back</Trans>
				) : (
					<Trans>Couldn't create workspace</Trans>
				)}
			</Text>
			<Text className="text-muted-foreground mt-1.5 font-mono text-xs">
				{subtitle}
			</Text>
			<View className="border-red-500/25 bg-red-500/5 mt-6 self-stretch rounded-lg border px-3.5 py-3">
				<Text className="text-red-500/90 text-xs leading-4">
					{failure.message}
				</Text>
				{unproven ? (
					<Text className="text-muted-foreground mt-1.5 text-xs leading-4">
						<Trans>
							The workspace may still have been created. This screen opens it if
							it appears.
						</Trans>
					</Text>
				) : null}
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
			<View className="mt-6 flex-row items-center gap-2.5">
				<Button
					size="sm"
					variant={unproven ? "secondary" : "default"}
					disabled={checking}
					onPress={onRetry}
				>
					<Text>
						{unproven ? <Trans>Create again</Trans> : <Trans>Try again</Trans>}
					</Text>
				</Button>
				<Button
					variant={unproven ? "default" : "secondary"}
					size="sm"
					onPress={onDismiss}
				>
					<Text>
						<Trans>Back to Home</Trans>
					</Text>
				</Button>
				{checking ? <ActivityIndicator size="small" /> : null}
			</View>
		</View>
	);
}
