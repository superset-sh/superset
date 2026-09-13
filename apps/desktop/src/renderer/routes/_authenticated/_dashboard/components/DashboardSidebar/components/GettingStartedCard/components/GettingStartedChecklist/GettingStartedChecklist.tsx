import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { cn } from "@superset/ui/utils";
import { LuCheck, LuLoaderCircle } from "react-icons/lu";
import { GETTING_STARTED_STEPS } from "../../constants";

interface GettingStartedChecklistProps {
	tried: number;
	pendingStep: number | null;
	onStart: (step: number) => void;
}

export function GettingStartedChecklist({
	tried,
	pendingStep,
	onStart,
}: GettingStartedChecklistProps) {
	const { t } = useLingui();
	const format = useFormat();
	const count = GETTING_STARTED_STEPS.filter(
		(_, index) => tried & (1 << index),
	).length;
	const completed = format.formatNumber(count);
	const total = format.formatNumber(GETTING_STARTED_STEPS.length);
	return (
		<div className="mt-2">
			<p className="text-xs text-muted-foreground">
				<Trans>
					{completed} of {total} tried
				</Trans>
			</p>
			<div
				role="progressbar"
				aria-label={t({ message: "Getting started" })}
				aria-valuemin={0}
				aria-valuemax={4}
				aria-valuenow={count}
				className="my-3 h-1 overflow-hidden rounded-full bg-muted"
			>
				<div
					className="h-full rounded-full bg-foreground transition-[width] motion-reduce:transition-none"
					style={{ width: `${count * 25}%` }}
				/>
			</div>
			<div className="-mx-1 flex flex-col gap-0.5">
				{GETTING_STARTED_STEPS.map((step, index) => {
					const isTried = Boolean(tried & (1 << index));
					return (
						<button
							key={step.label.id}
							type="button"
							disabled={pendingStep !== null}
							onClick={() => onStart(index)}
							className={cn(
								"flex w-full items-center gap-2.5 rounded-md px-1 py-2 text-left text-xs hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
								isTried && "text-muted-foreground",
							)}
						>
							<span
								aria-hidden="true"
								className={cn(
									"flex size-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground/60",
									isTried && "border-foreground bg-foreground text-background",
								)}
							>
								{pendingStep === index ? (
									<LuLoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />
								) : isTried ? (
									<LuCheck className="size-3" />
								) : null}
							</span>
							<span>{t(step.label)}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
