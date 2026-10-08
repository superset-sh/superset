import { Trans } from "@lingui/react/macro";
import { Bot, Clock, Folder, Laptop } from "lucide-react";
import type { RunStepId } from "../../../../../../../../constants";

const HIGHLIGHT = "outline-1 outline-blue-500 outline-offset-2 outline-dashed";

export function SettingsTab({ step }: { step: RunStepId }) {
	return (
		<div className="min-h-[18.75rem] space-y-5 px-4 pt-4 pb-8 text-sm sm:min-h-0 sm:px-6">
			<div>
				<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
					<Trans>Instructions</Trans>
				</p>
				<p
					className={`-mx-2 mt-1 rounded-sm px-2 py-1 text-foreground leading-relaxed ${step === "write" ? HIGHLIGHT : ""}`}
				>
					<Trans>
						Check each package for a newer version. Update the safe ones and
						open a pull request.
					</Trans>
				</p>
			</div>
			<div className="flex flex-wrap gap-2 text-muted-foreground text-xs">
				<span className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
					<Laptop className="size-3.5" />
					MacBook Pro
				</span>
				<span className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
					<Folder className="size-3.5" />
					superset
				</span>
				<span
					className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${step === "write" ? "border-foreground/40 text-foreground" : "border-border"}`}
				>
					<Bot className="size-3.5" />
					claude
				</span>
			</div>
			<div>
				<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
					<Trans>Triggers</Trans>
				</p>
				<div
					className={`mt-2 flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs ${step === "schedule" ? HIGHLIGHT : ""}`}
				>
					<Clock className="size-3.5 text-muted-foreground" />
					<span className="text-foreground">
						<Trans>Every Monday at 8:00 AM</Trans>
					</span>
					<span className="ml-auto hidden text-muted-foreground sm:inline">
						<Trans>Next run in 3d</Trans>
					</span>
				</div>
			</div>
		</div>
	);
}
