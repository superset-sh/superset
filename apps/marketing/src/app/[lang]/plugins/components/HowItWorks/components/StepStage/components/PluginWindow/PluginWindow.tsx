import { Trans } from "@lingui/react/macro";
import { ChevronLeft, Plus, Sparkles } from "lucide-react";
import type { StepId } from "../../../../../../constants";
import { PluginIcon } from "../../../../../PluginIcon";

const SKILLS = ["file-issue", "duplicate-sweep", "project-status"];

export function PluginWindow({ step }: { step: StepId }) {
	const installed = step !== "install";

	return (
		<div className="overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
			<div className="flex h-10 items-center gap-1 border-border border-b px-3 text-muted-foreground text-xs">
				<ChevronLeft className="size-3.5" />
				<Trans>Plugins</Trans>
			</div>
			<div className="px-5 pt-5 pb-6 sm:px-8">
				<div className="flex items-center gap-3">
					<PluginIcon name="linear" />
					<div className="min-w-0 flex-1">
						<p className="font-medium text-foreground">Linear</p>
						<p className="truncate text-muted-foreground text-xs">
							<Trans>File and update issues</Trans>
						</p>
					</div>
					{installed ? (
						<span
							className={`flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs ${step === "mention" ? "bg-foreground text-background" : "border border-border text-foreground"}`}
						>
							<Sparkles className="size-3" />
							<Trans>Try now</Trans>
						</span>
					) : (
						<span className="flex shrink-0 items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-background text-xs ring-2 ring-brand/60 ring-offset-2 ring-offset-background">
							<Plus className="size-3" />
							<Trans>Install plugin</Trans>
						</span>
					)}
				</div>
				<p className="mt-6 border-border border-b pb-2 font-medium text-foreground text-xs">
					<Trans>Connected accounts</Trans>
				</p>
				<div className="flex h-10 items-center gap-2 text-xs">
					{installed ? (
						<>
							<span className="size-1.5 rounded-full bg-emerald-500" />
							<span className="text-foreground">maya@acme.com</span>
						</>
					) : (
						<span className="text-muted-foreground">
							<Trans>Not connected</Trans>
						</span>
					)}
				</div>
				<p className="mt-2 border-border border-b pb-2 font-medium text-foreground text-xs">
					<Trans>Skills</Trans>
					<span className="ml-1.5 text-muted-foreground">{SKILLS.length}</span>
				</p>
				<ul className="divide-y divide-border/60 font-mono text-[11px] text-muted-foreground">
					{SKILLS.map((skill) => (
						<li key={skill} className="py-2">
							{skill}
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
