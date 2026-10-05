import { Trans } from "@lingui/react/macro";
import type { PaneDisposition, TeleportPlan } from "@superset/shared/teleport";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { PlanRefusal } from "./components/PlanRefusal";
import { PlanSummary } from "./components/PlanSummary";

interface TeleportPlanStepProps {
	plan: TeleportPlan | null;
	hostName: string;
	onBack: () => void;
	onConfirm: () => void;
}

/**
 * The plan, which is the feature.
 *
 * Every pane gets a row and a verb, so no part of the move is left to the
 * user's imagination, and the refusals appear here rather than surfacing as
 * a failure eight steps into a run.
 */
export function TeleportPlanStep({
	plan,
	hostName,
	onBack,
	onConfirm,
}: TeleportPlanStepProps) {
	if (!plan) {
		return (
			<div className="flex items-center gap-2 px-1 py-8 text-muted-foreground text-sm">
				<Spinner className="size-4" />
				<Trans>Checking {hostName} and the running programs…</Trans>
			</div>
		);
	}

	const blocked = plan.refusals.length > 0;

	return (
		<>
			<div className="max-h-96 space-y-4 overflow-y-auto px-1">
				{blocked ? (
					plan.refusals.map((refusal) => (
						<PlanRefusal
							key={`${refusal.kind}-${refusal.branch}`}
							refusal={refusal}
							hostName={hostName}
						/>
					))
				) : (
					<PlanSummary plan={plan} hostName={hostName} />
				)}

				{!blocked &&
					plan.tabs.map((tab) => (
						<div key={tab.tabId}>
							<p className="font-semibold text-sm">{tab.title}</p>
							<ul className="mt-1 space-y-1 border-border border-l pl-3">
								{tab.panes.map((pane) => (
									<li
										key={pane.paneId}
										className="flex items-baseline justify-between gap-4 text-sm"
									>
										<span className="truncate font-mono text-xs">
											{pane.label}
										</span>
										<span className="shrink-0 text-emerald-600 text-xs dark:text-emerald-400">
											<DispositionLabel disposition={pane.disposition} />
										</span>
									</li>
								))}
							</ul>
						</div>
					))}

				{!blocked && (
					<p className="text-muted-foreground text-xs">
						<Trans>
							Setup scripts run on arrival. This workspace stays here, stopped,
							until you delete it.
						</Trans>
					</p>
				)}
			</div>

			<div className="flex justify-end gap-2">
				<Button variant="ghost" onClick={onBack}>
					<Trans>Back</Trans>
				</Button>
				<Button disabled={blocked} onClick={onConfirm}>
					<Trans>Teleport</Trans>
				</Button>
			</div>
		</>
	);
}

/**
 * The verb for a pane. Each one is a promise about what the user will find
 * on the other side, so they are worded as outcomes rather than mechanisms.
 */
function DispositionLabel({ disposition }: { disposition: PaneDisposition }) {
	switch (disposition.kind) {
		case "agent-resumes":
			return <Trans>hands off &amp; resumes</Trans>;
		case "agent-restarts":
			return <Trans>hands off &amp; starts fresh</Trans>;
		case "process-restarts":
			return <Trans>restarts</Trans>;
		case "shell-opens":
			return <Trans>opens empty</Trans>;
	}
}
