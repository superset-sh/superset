import { Trans, useLingui } from "@lingui/react/macro";
import { Check } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { AsciiSpinner } from "@/screens/(authenticated)/components/AsciiSpinner";

// Synthetic timings, desktop's WorkspaceCreatingState trick: the create
// streams no progress, so the first steps advance on a clock and the
// worktree step holds until the row actually lands.
const STEP_DONE_AT_S = [2, 12];
const TYPICAL_SECONDS = 25;
const SLOW_HINT_AT_S = 60;

type StepState = "done" | "active" | "todo";

export function WorkspaceCreatingState({
	subtitle,
	agentLabel,
	startedAt,
	workspaceResolved,
	onBackHome,
}: {
	/** `projectName · branchLabel` — the two things the user chose. */
	subtitle: string;
	agentLabel: string;
	startedAt: number;
	/** The host registered the row; only the agent launch remains. */
	workspaceResolved: boolean;
	onBackHome: () => void;
}) {
	const { t } = useLingui();
	const elapsedSeconds = useElapsedSeconds(startedAt);
	const steps: Array<{ label: string; state: StepState }> = [
		t({ message: "Preparing" }),
		t({
			message: "Fetching latest changes",
		}),
		t({
			message: "Creating worktree",
		}),
		t({
			message: `Starting ${agentLabel}`,
		}),
	].map((label, index) => ({
		label,
		state: stepState(index, elapsedSeconds, workspaceResolved),
	}));

	return (
		<View className="flex-1 items-center justify-center px-8">
			<AsciiSpinner />
			<Text className="mt-3 font-semibold text-[17px]">
				<Trans>Creating workspace</Trans>
			</Text>
			<Text className="text-muted-foreground mt-1.5 font-mono text-xs">
				{subtitle}
			</Text>
			<View className="mt-6 gap-2.5 self-stretch px-3">
				{steps.map((step) => (
					<StepRow key={step.label} label={step.label} state={step.state} />
				))}
			</View>
			<View className="mt-6 flex-row justify-between self-stretch px-3">
				<Text className="text-muted-foreground font-mono text-[11px]">
					{formatElapsed(elapsedSeconds)}
				</Text>
				<Text className="text-muted-foreground font-mono text-[11px]">
					{t({
						message: `~${TYPICAL_SECONDS}s typical`,
					})}
				</Text>
			</View>
			{elapsedSeconds >= SLOW_HINT_AT_S ? (
				<View className="border-border mt-5 gap-3 self-stretch border-t px-3 pt-4">
					<Text className="text-muted-foreground text-[13px] leading-5">
						<Trans>
							Still working — large repos can take a few minutes. You can leave;
							the workspace will appear on Home when it's ready.
						</Trans>
					</Text>
					<Button
						variant="secondary"
						size="sm"
						className="self-start"
						onPress={onBackHome}
					>
						<Text>
							<Trans>Back to Home</Trans>
						</Text>
					</Button>
				</View>
			) : null}
		</View>
	);
}

function stepState(
	index: number,
	elapsedSeconds: number,
	workspaceResolved: boolean,
): StepState {
	// Row landed: everything up to the agent launch is genuinely done.
	if (workspaceResolved) return index < 3 ? "done" : "active";
	const activeIndex = STEP_DONE_AT_S.findIndex(
		(doneAt) => elapsedSeconds < doneAt,
	);
	// Past the synthetic budget the worktree step holds until the row lands —
	// never claim the agent is starting before the workspace exists.
	const active = activeIndex === -1 ? 2 : activeIndex;
	if (index < active) return "done";
	return index === active ? "active" : "todo";
}

function StepRow({ label, state }: { label: string; state: StepState }) {
	const theme = useTheme();
	return (
		<View className="flex-row items-center gap-2.5">
			<View className="size-4 items-center justify-center">
				{state === "done" ? (
					<View className="bg-foreground/85 size-4 items-center justify-center rounded-full">
						<Check size={9} color={theme.background} strokeWidth={3.5} />
					</View>
				) : state === "active" ? (
					<View className="border-amber-500/60 size-4 items-center justify-center rounded-full border">
						<View className="bg-amber-500 size-1.5 rounded-full" />
					</View>
				) : (
					<View className="bg-muted-foreground/40 size-1.5 rounded-full" />
				)}
			</View>
			<Text
				className={cn(
					"text-[13px]",
					state === "done" && "text-foreground/80",
					state === "active" && "text-foreground font-medium",
					state === "todo" && "text-muted-foreground/55",
				)}
			>
				{label}
			</Text>
		</View>
	);
}

function formatElapsed(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor(total / 60);
	return `${minutes}:${(total % 60).toString().padStart(2, "0")}`;
}

function useElapsedSeconds(startedAt: number): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), 500);
		return () => clearInterval(interval);
	}, []);
	return Math.max(0, (now - startedAt) / 1000);
}
