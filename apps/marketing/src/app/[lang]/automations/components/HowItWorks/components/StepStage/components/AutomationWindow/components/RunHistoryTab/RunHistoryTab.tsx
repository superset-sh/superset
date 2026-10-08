import { Trans } from "@lingui/react/macro";
import type { RunStepId } from "../../../../../../../../constants";
import { RunStatusDot } from "../../../../../../../RunStatusDot";

export function RunHistoryTab({ step }: { step: RunStepId }) {
	const running = step === "run";

	return (
		<ul className="min-h-[18.75rem] space-y-0.5 px-2 pt-3 pb-8 text-sm sm:min-h-0 sm:px-4">
			<li
				className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${running ? "" : "bg-muted/60"}`}
			>
				<RunStatusDot status={running ? "creating" : "created"} />
				<span className="truncate text-foreground">
					<Trans>Dependency sweep</Trans>
				</span>
				<span className="ml-auto shrink-0 text-muted-foreground text-xs">
					{running ? <Trans>creating</Trans> : <Trans>created</Trans>}
					{" · "}
					{running ? <Trans>just now</Trans> : <Trans>2 min ago</Trans>}
				</span>
			</li>
			<li className="flex items-center gap-2 px-2 py-1.5">
				<RunStatusDot status="created" />
				<span className="truncate text-foreground">
					<Trans>Dependency sweep</Trans>
				</span>
				<span className="ml-auto shrink-0 text-muted-foreground text-xs">
					<Trans>1 week ago</Trans>
				</span>
			</li>
			<li className="px-2 py-1.5">
				<span className="flex items-center gap-2">
					<RunStatusDot status="failed" />
					<span className="truncate text-foreground">
						<Trans>Dependency sweep</Trans>
					</span>
					<span className="ml-auto shrink-0 text-muted-foreground text-xs">
						<Trans>2 weeks ago</Trans>
					</span>
				</span>
				<span className="mt-1.5 block rounded-md bg-red-500/10 px-2 py-1.5 text-red-500 text-xs">
					<Trans>The device was offline at the scheduled time.</Trans>
				</span>
			</li>
			<li className="flex items-center gap-2 px-2 py-1.5">
				<RunStatusDot status="created" />
				<span className="truncate text-foreground">
					<Trans>Dependency sweep</Trans>
				</span>
				<span className="ml-auto shrink-0 text-muted-foreground text-xs">
					<Trans>3 weeks ago</Trans>
				</span>
			</li>
		</ul>
	);
}
