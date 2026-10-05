import { Trans } from "@lingui/react/macro";
import { TELEPORT_STEPS } from "@superset/shared/teleport";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/lib/utils";
import { Check, CircleDashed, LoaderCircle, X } from "lucide-react";
import type { TeleportRunState, TeleportStepState } from "../../types";
import { useTeleportStepLabels } from "./hooks/useTeleportStepLabels";

interface TeleportProgressStepProps {
	run: TeleportRunState;
	hostName: string;
	isDone: boolean;
	onClose: () => void;
	onOpenThere: () => void;
}

/**
 * Named steps, not a spinner.
 *
 * The value is in a failure: the user sees which step stopped, and
 * therefore that every step above it completed — which is how they know
 * their work is safe on the source and nothing is half-applied there.
 */
export function TeleportProgressStep({
	run,
	hostName,
	isDone,
	onClose,
	onOpenThere,
}: TeleportProgressStepProps) {
	const labels = useTeleportStepLabels();

	return (
		<>
			<ul className="space-y-1 px-1">
				{TELEPORT_STEPS.map((step) => {
					const state = run.steps[step] ?? "pending";
					return (
						<li
							key={step}
							className={cn(
								"flex items-center gap-2.5 text-sm",
								state === "pending" && "text-muted-foreground",
								state === "running" && "font-medium",
								state === "failed" && "text-destructive",
							)}
						>
							<StepIcon state={state} />
							{labels[step]}
						</li>
					);
				})}
			</ul>

			{run.error && (
				<p className="px-1 text-destructive text-xs">{run.error}</p>
			)}

			<div className="flex justify-end gap-2">
				<Button variant="ghost" onClick={onClose}>
					{isDone ? <Trans>Close</Trans> : <Trans>Run in background</Trans>}
				</Button>
				<Button disabled={!isDone} onClick={onOpenThere}>
					<Trans>Open on {hostName}</Trans>
				</Button>
			</div>
		</>
	);
}

function StepIcon({ state }: { state: TeleportStepState }) {
	const className = "size-3.5 shrink-0";
	switch (state) {
		case "done":
			return (
				<Check
					className={cn(className, "text-emerald-600 dark:text-emerald-400")}
				/>
			);
		case "running":
			return <LoaderCircle className={cn(className, "animate-spin")} />;
		case "failed":
			return <X className={className} />;
		case "pending":
			return <CircleDashed className={cn(className, "opacity-50")} />;
	}
}
