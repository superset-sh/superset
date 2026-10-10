import { Trans } from "@lingui/react/macro";
import { Share } from "lucide-react";
import type { LoopStepId } from "../../../../../../constants";

const BAR_HEIGHTS = [
	"h-[35%]",
	"h-[45%]",
	"h-[40%]",
	"h-[60%]",
	"h-[75%]",
	"h-full",
];

export function PageWindow({ step }: { step: LoopStepId }) {
	const iterated = step === "iterate";
	const pinned = step === "comment" || step === "iterate";

	return (
		<div className="overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
			<div className="flex h-10 items-center gap-2 border-border border-b px-3 text-xs">
				<span className="truncate font-medium text-foreground">
					<Trans>Onboarding redesign</Trans>
				</span>
				<span className="rounded-sm border border-border px-1.5 font-mono text-[10px] text-muted-foreground">
					{iterated ? "v2" : "v1"}
				</span>
				<span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
					<span className="size-1.5 rounded-full bg-emerald-500" />
					claude
				</span>
				<span
					className={`flex items-center gap-1 rounded-sm border px-2 py-0.5 ${step === "share" ? "border-foreground/40 text-foreground" : "border-border text-muted-foreground"}`}
				>
					<Share className="size-3" />
					<Trans>Share</Trans>
				</span>
			</div>
			<div className="px-6 pt-6 pb-8 sm:px-8">
				<p className="font-mono text-[10px] text-brand uppercase tracking-widest">
					<Trans>Design review</Trans>
				</p>
				<div className="relative mt-2 inline-block">
					<p
						className={`rounded-sm font-medium text-foreground text-2xl tracking-tight ${step === "comment" ? "outline-1 outline-blue-500 outline-offset-4 outline-dashed" : ""}`}
					>
						<Trans>Sign up in one step</Trans>
						{iterated && (
							<span className="block rounded-sm bg-emerald-500/15">
								<Trans>Start building in two.</Trans>
							</span>
						)}
					</p>
					{pinned && (
						<span
							className={`absolute -top-4 -right-6 flex size-6 items-center justify-center rounded-full rounded-bl-sm font-medium text-[10px] text-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] ring-1 ring-white ${iterated ? "bg-neutral-500" : "bg-blue-600"}`}
						>
							1
						</span>
					)}
				</div>
				<div className="mt-4 max-w-sm space-y-1.5">
					<div className="h-1.5 w-full rounded-full bg-muted" />
					<div className="h-1.5 w-4/5 rounded-full bg-muted" />
				</div>
				<div className="mt-6 flex h-16 max-w-56 items-end gap-1.5 border-border border-b">
					{BAR_HEIGHTS.map((height) => (
						<div
							key={height}
							className={`flex-1 rounded-t-sm bg-muted-foreground/25 ${height}`}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
