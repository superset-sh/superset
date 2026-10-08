import { Trans } from "@lingui/react/macro";
import {
	ArrowLeft,
	ArrowRight,
	Ellipsis,
	Globe,
	Monitor,
	RotateCw,
	SquareDashedMousePointer,
	X,
} from "lucide-react";
import type { BrowserStepId } from "../../../../../../constants";

const PICK_BLUE = "#0d99ff";

const CARDS = ["w-3/5", "w-2/5", "w-1/2"];

export function PaneWindow({ step }: { step: BrowserStepId }) {
	const designOn = step === "pick" || step === "describe";
	const changed = step === "verify";

	return (
		<div className="overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
			<div className="flex h-9 items-center gap-1.5 border-border border-b px-2 text-xs">
				<span className="flex shrink-0 items-center gap-0.5 text-muted-foreground/70">
					<ArrowLeft className="size-3.5" />
					<ArrowRight className="size-3.5 opacity-40" />
					<RotateCw
						className={`size-3.5 ${changed ? "text-foreground" : ""}`}
					/>
				</span>
				<span
					className={`flex h-[22px] min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 ${step === "open" ? "bg-muted/60" : ""}`}
				>
					<Globe className="size-3 shrink-0 text-muted-foreground" />
					<span className="truncate text-foreground/75">
						http://localhost:3000
					</span>
				</span>
				<span
					className={`flex h-[22px] shrink-0 items-center gap-1 rounded-md px-1.5 font-medium text-[11px] ${designOn ? "bg-[#0d99ff] text-white" : "text-muted-foreground"}`}
				>
					<SquareDashedMousePointer className="size-3" />
					<Trans>Design</Trans>
				</span>
				<Monitor className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" />
				<Ellipsis className="size-3.5 shrink-0 text-muted-foreground" />
			</div>
			{designOn && (
				<div className="flex items-center gap-2 border-border/60 border-b bg-[#0d99ff]/10 px-3 py-1.5 text-[11px] text-foreground/90">
					<SquareDashedMousePointer
						className="size-3 shrink-0"
						style={{ color: PICK_BLUE }}
					/>
					<span className="min-w-0 flex-1 truncate">
						{step === "pick" ? (
							<Trans>Click any element to send it to an agent.</Trans>
						) : (
							<Trans>Element captured. Describe the change.</Trans>
						)}
					</span>
					<X className="size-3 shrink-0 text-muted-foreground/60" />
				</div>
			)}
			<div className="px-6 pt-5 pb-8 sm:px-8">
				<div className="flex items-center justify-between">
					<span className="font-semibold text-foreground text-sm tracking-tight">
						acme
					</span>
					<span className="flex gap-3">
						<span className="h-1.5 w-8 rounded-full bg-muted" />
						<span className="h-1.5 w-8 rounded-full bg-muted" />
						<span className="h-1.5 w-8 rounded-full bg-muted" />
					</span>
				</div>
				<p className="mt-8 max-w-xs font-medium text-xl sm:text-2xl text-foreground tracking-tight">
					<Trans>Send invoices in a minute</Trans>
				</p>
				<div className="mt-3 max-w-sm space-y-1.5">
					<div className="h-1.5 w-full rounded-full bg-muted" />
					<div className="h-1.5 w-3/5 rounded-full bg-muted" />
				</div>
				<div className="relative mt-6 inline-block">
					{designOn && (
						<span
							className="absolute -top-5 left-0 whitespace-nowrap rounded-sm px-1 font-mono text-[9px] text-white"
							style={{ backgroundColor: PICK_BLUE }}
						>
							&lt;CTAButton&gt; 132×36
						</span>
					)}
					<span
						className={`flex h-9 items-center rounded-md px-4 font-medium text-xs transition-colors ${changed ? "bg-brand text-white shadow-lg" : "border border-border text-muted-foreground"} ${designOn ? "outline-2 outline-[#0d99ff] outline-offset-2 outline-dashed" : ""}`}
					>
						<Trans>Start free trial</Trans>
					</span>
				</div>
				<div className="mt-8 hidden grid-cols-3 gap-3 sm:grid">
					{CARDS.map((card) => (
						<div
							key={card}
							className="space-y-1.5 rounded-md border border-border p-3"
						>
							<div className="size-4 rounded-sm bg-muted" />
							<div className="h-1.5 w-4/5 rounded-full bg-muted" />
							<div className={`h-1.5 rounded-full bg-muted ${card}`} />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
