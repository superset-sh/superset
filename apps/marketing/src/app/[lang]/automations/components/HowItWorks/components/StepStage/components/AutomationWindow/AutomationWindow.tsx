import { Trans } from "@lingui/react/macro";
import { Play } from "lucide-react";
import type { RunStepId } from "../../../../../../constants";
import { RunHistoryTab } from "./components/RunHistoryTab";
import { SettingsTab } from "./components/SettingsTab";

export function AutomationWindow({ step }: { step: RunStepId }) {
	const showRuns = step === "run" || step === "review";

	return (
		<div className="overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
			<div className="flex h-10 items-center gap-2 border-border border-b px-3 text-xs">
				<span className="truncate font-medium text-foreground">
					<Trans>Dependency sweep</Trans>
				</span>
				<span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
					<span className="flex h-3.5 w-6 items-center justify-end rounded-full bg-emerald-500 p-0.5">
						<span className="size-2.5 rounded-full bg-white" />
					</span>
					<span className="hidden sm:inline">
						<Trans>Active</Trans>
					</span>
				</span>
				<span
					className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border px-2 py-0.5 ${step === "run" ? "border-foreground/40 text-foreground" : "border-border text-muted-foreground"}`}
				>
					<Play className="size-3" />
					<Trans>Run now</Trans>
				</span>
			</div>
			<div className="flex gap-4 border-border border-b px-4 text-xs">
				<span
					className={`border-b py-2 ${showRuns ? "border-transparent text-muted-foreground" : "border-foreground text-foreground"}`}
				>
					<Trans>Settings</Trans>
				</span>
				<span
					className={`border-b py-2 ${showRuns ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
				>
					<Trans>Run History</Trans>
				</span>
			</div>
			{showRuns ? <RunHistoryTab step={step} /> : <SettingsTab step={step} />}
		</div>
	);
}
