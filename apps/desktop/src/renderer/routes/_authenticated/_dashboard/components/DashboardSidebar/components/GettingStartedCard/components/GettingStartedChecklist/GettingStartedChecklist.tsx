import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { cn } from "@superset/ui/utils";
import { LuCheck } from "react-icons/lu";
import type { GETTING_STARTED_STEPS } from "../../constants";

interface GettingStartedChecklistProps {
	completed: number;
	steps: readonly (typeof GETTING_STARTED_STEPS)[number][];
	onStart: (step: number) => void;
}

export function GettingStartedChecklist({
	completed: completionMask,
	steps,
	onStart,
}: GettingStartedChecklistProps) {
	const { t } = useLingui();
	const format = useFormat();
	const count = steps.filter(
		(step) => completionMask & (1 << step.progressIndex),
	).length;
	const completed = format.formatNumber(count);
	const total = format.formatNumber(steps.length);
	return (
		<div className="mt-2">
			<p className="text-xs text-muted-foreground">
				<Trans>
					{completed} of {total} completed
				</Trans>
			</p>
			<div
				role="progressbar"
				aria-label={t({ message: "Get the best out of Pro" })}
				aria-valuemin={0}
				aria-valuemax={steps.length}
				aria-valuenow={count}
				className="my-3 h-1 overflow-hidden rounded-full bg-muted"
			>
				<div
					className="h-full rounded-full bg-foreground transition-[width] motion-reduce:transition-none"
					style={{ width: `${(count / steps.length) * 100}%` }}
				/>
			</div>
			<div className="-mx-1 flex flex-col gap-0.5">
				{steps.map((step, index) => {
					const isCompleted = Boolean(
						completionMask & (1 << step.progressIndex),
					);
					return (
						<button
							key={step.label.id}
							type="button"
							onClick={() => onStart(index)}
							className={cn(
								"flex w-full items-center gap-2.5 rounded-md px-1 py-2 text-left text-xs hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								isCompleted && "text-muted-foreground",
							)}
						>
							<span
								aria-hidden="true"
								className={cn(
									"flex size-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground/60",
									isCompleted &&
										"border-foreground bg-foreground text-background",
								)}
							>
								{isCompleted ? <LuCheck className="size-3" /> : null}
							</span>
							<span>{t(step.label)}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
