import { HiCheck } from "react-icons/hi2";

interface ProgressStep {
	id: string;
	label: string;
	status: "pending" | "active" | "done";
}

interface PendingCreatingStatusProps {
	steps: ProgressStep[];
	elapsedLabel: string;
	isStale: boolean;
	onDismiss: () => void;
}

export function PendingCreatingStatus({
	steps,
	elapsedLabel,
	isStale,
	onDismiss,
}: PendingCreatingStatusProps) {
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<p
					className={`text-sm ${isStale ? "text-amber-500" : "text-muted-foreground"}`}
				>
					{isStale
						? "This is taking longer than expected..."
						: "Creating workspace..."}
				</p>
				<span className="text-xs tabular-nums text-muted-foreground/50">
					{elapsedLabel}
				</span>
			</div>
			{steps.length > 0 && (
				<div className="space-y-2">
					{steps.map((step) => (
						<div key={step.id} className="flex items-center gap-2.5 text-sm">
							{step.status === "done" ? (
								<HiCheck className="size-4 text-emerald-500" />
							) : step.status === "active" ? (
								<div className="size-4 flex items-center justify-center">
									<div className="size-2.5 rounded-full bg-foreground animate-pulse" />
								</div>
							) : (
								<div className="size-4 flex items-center justify-center">
									<div className="size-2 rounded-full bg-muted-foreground/30" />
								</div>
							)}
							<span
								className={
									step.status === "done" || step.status === "active"
										? "text-foreground"
										: "text-muted-foreground/50"
								}
							>
								{step.label}
							</span>
						</div>
					))}
				</div>
			)}
			<div className="flex gap-2 pt-1">
				<button
					type="button"
					className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
					onClick={onDismiss}
				>
					Dismiss
				</button>
			</div>
		</div>
	);
}
