import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { m } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import type { RunStepId } from "../../../../constants";
import { STEP_DURATION_MS } from "../../constants";

interface StepListProps {
	steps: {
		id: RunStepId;
		title: MessageDescriptor;
		description: MessageDescriptor;
	}[];
	active: number;
	autoplay: boolean;
	onSelect: (index: number) => void;
	onPreview: (index: number | null) => void;
	onFocusChange: (focused: boolean) => void;
}

export function StepList({
	steps,
	active,
	autoplay,
	onSelect,
	onPreview,
	onFocusChange,
}: StepListProps) {
	const { t } = useLingui();
	const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const delta =
			event.key === "ArrowDown" || event.key === "ArrowRight"
				? 1
				: event.key === "ArrowUp" || event.key === "ArrowLeft"
					? -1
					: 0;
		if (!delta) return;
		event.preventDefault();
		const focusedIndex = tabRefs.current.indexOf(
			document.activeElement as HTMLButtonElement,
		);
		const from = focusedIndex === -1 ? active : focusedIndex;
		const next = (from + delta + steps.length) % steps.length;
		onSelect(next);
		tabRefs.current[next]?.focus();
	};

	return (
		<div className="flex flex-col border border-border lg:border-r-0">
			<div
				role="tablist"
				aria-orientation="vertical"
				onKeyDown={onKeyDown}
				onMouseLeave={() => onPreview(null)}
				onFocus={() => onFocusChange(true)}
				onBlur={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget)) {
						onFocusChange(false);
					}
				}}
				className="flex flex-1 flex-col divide-y divide-border"
			>
				{steps.map((step, index) => {
					const selected = index === active;
					return (
						<button
							key={step.id}
							ref={(node) => {
								tabRefs.current[index] = node;
							}}
							type="button"
							role="tab"
							aria-selected={selected}
							tabIndex={selected ? 0 : -1}
							onClick={() => onSelect(index)}
							onMouseEnter={() => onPreview(index)}
							className={`relative flex flex-1 gap-4 px-6 py-5 text-left transition-colors ${selected ? "bg-muted/60" : "hover:bg-muted/30"}`}
						>
							<span className="pt-1 font-mono text-brand text-xs">
								{String(index + 1).padStart(2, "0")}
							</span>
							<span className="space-y-1.5">
								<span
									className={`block font-medium text-lg tracking-tight ${selected ? "text-foreground" : "text-muted-foreground"}`}
								>
									{t(step.title)}
								</span>
								<span
									className={`text-muted-foreground text-sm leading-relaxed lg:block ${selected ? "block" : "hidden"}`}
								>
									{t(step.description)}
								</span>
							</span>
							{selected && autoplay && (
								<m.span
									key={`progress-${active}`}
									aria-hidden="true"
									className="absolute bottom-0 left-0 h-px bg-foreground"
									initial={{ width: "0%" }}
									animate={{ width: "100%" }}
									transition={{
										duration: STEP_DURATION_MS / 1000,
										ease: "linear",
									}}
								/>
							)}
						</button>
					);
				})}
			</div>
			<p className="flex items-center gap-2 border-border border-t px-6 py-3 text-muted-foreground text-xs">
				<RotateCcw aria-hidden="true" className="size-3.5" />
				<Trans>Steps 3 and 4 repeat at every scheduled time.</Trans>
			</p>
		</div>
	);
}
