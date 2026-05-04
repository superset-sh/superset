import { cn } from "@superset/ui/utils";
import { Check, GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import "./WorkspaceCreatingState.css";

interface Step {
	id: string;
	label: string;
	/** Cumulative seconds at which this step is considered complete. */
	doneAt: number;
}

const STEPS: readonly Step[] = [
	{ id: "allocate", label: "Allocating sandbox", doneAt: 3 },
	{ id: "clone", label: "Cloning repository", doneAt: 12 },
	{ id: "branch", label: "Configuring branch", doneAt: 16 },
	{ id: "tools", label: "Installing tools", doneAt: 22 },
	{ id: "finalize", label: "Finalizing", doneAt: 28 },
] as const;

const TOTAL_SECONDS = STEPS[STEPS.length - 1].doneAt;
// Cap synthetic progress so the bar never reaches 100% before real completion.
const PROGRESS_CAP = 0.94;

interface WorkspaceCreatingStateProps {
	name?: string;
	branch?: string;
	startedAt?: number;
}

export function WorkspaceCreatingState({
	name,
	branch,
	startedAt,
}: WorkspaceCreatingStateProps) {
	const elapsed = useElapsedSeconds(startedAt);
	const activeIndex = getActiveIndex(elapsed);
	const progress = Math.min(elapsed / TOTAL_SECONDS, PROGRESS_CAP);

	return (
		<div className="relative flex h-full w-full items-center justify-center overflow-hidden p-6">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(ellipse 55% 45% at 50% 35%, hsl(var(--muted) / 0.55), transparent 70%)",
				}}
			/>
			<div className="relative w-full max-w-[420px]">
				<div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_0_0_hsl(0_0%_100%/0.04)_inset,0_10px_40px_-12px_hsl(0_0%_0%/0.45)]">
					<div className="wcs-bar-track">
						<div
							className="wcs-bar-fill"
							style={{ width: `${progress * 100}%` }}
						/>
						<div className="wcs-bar-sweep" />
					</div>

					<div className="px-6 pt-6 pb-5">
						<div className="space-y-2">
							<p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
								Creating workspace
							</p>
							<h1 className="truncate text-[17px] font-semibold leading-tight tracking-tight text-foreground">
								{name || "Untitled workspace"}
							</h1>
							{branch && (
								<div className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
									<GitBranch className="size-3 shrink-0" />
									<span className="truncate">{branch}</span>
								</div>
							)}
						</div>

						<ul className="mt-5 space-y-2">
							{STEPS.map((step, i) => {
								const state: StepState =
									i < activeIndex
										? "done"
										: i === activeIndex
											? "active"
											: "pending";
								return (
									<StepRow key={step.id} label={step.label} state={state} />
								);
							})}
						</ul>

						<div className="mt-5 flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
							<span>This usually takes ~{TOTAL_SECONDS}s</span>
							<span className="font-mono tabular-nums text-muted-foreground/85">
								{formatElapsed(elapsed)}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

type StepState = "done" | "active" | "pending";

function StepRow({ label, state }: { label: string; state: StepState }) {
	return (
		<li
			className={cn(
				"flex items-center gap-2.5 text-[13px] leading-tight transition-colors duration-300",
				state === "done" && "text-foreground/80",
				state === "active" && "text-foreground",
				state === "pending" && "text-muted-foreground/55",
			)}
		>
			<StepIcon state={state} />
			{state === "active" ? (
				<span className="wcs-step-active-shimmer font-medium">{label}</span>
			) : (
				<span className={cn(state === "done" && "font-medium")}>{label}</span>
			)}
		</li>
	);
}

function StepIcon({ state }: { state: StepState }) {
	if (state === "done") {
		return (
			<span className="grid size-4 shrink-0 place-items-center rounded-full bg-foreground/85 text-background">
				<Check className="size-2.5" strokeWidth={3} />
			</span>
		);
	}
	if (state === "active") {
		return (
			<span className="relative grid size-4 shrink-0 place-items-center">
				<span className="absolute inset-0 rounded-full border border-orange-400/40" />
				<span className="wcs-active-ring absolute inset-0 rounded-full border border-orange-400/70" />
				<span className="size-1.5 rounded-full bg-orange-400 shadow-[0_0_6px_0_hsl(24_95%_60%/0.7)]" />
			</span>
		);
	}
	return (
		<span className="grid size-4 shrink-0 place-items-center">
			<span className="size-1.5 rounded-full bg-muted-foreground/40" />
		</span>
	);
}

function getActiveIndex(elapsed: number): number {
	for (let i = 0; i < STEPS.length; i++) {
		if (elapsed < STEPS[i].doneAt) return i;
	}
	// Past the synthetic budget — keep the last step active until real completion.
	return STEPS.length - 1;
}

function formatElapsed(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

function useElapsedSeconds(startedAt: number | undefined): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), 250);
		return () => window.clearInterval(id);
	}, []);
	if (!startedAt) return 0;
	return Math.max(0, (now - startedAt) / 1000);
}
