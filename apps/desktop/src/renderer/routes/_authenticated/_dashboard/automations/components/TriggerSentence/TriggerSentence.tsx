import type {
	DraftTrigger,
	TriggerProblem,
} from "@superset/shared/automation-triggers";
import { Button } from "@superset/ui/button";
import type { ReactNode } from "react";
import { LuTrash2 } from "react-icons/lu";
import { type ProviderOptions, providerFor } from "../providers";
import { CHIP_INVALID } from "./chipStyles";

interface TriggerSentenceProps {
	trigger: DraftTrigger;
	onChange: (next: DraftTrigger) => void;
	onRemove: () => void;
	options: ProviderOptions;
	/** This row's problems, already filtered to it by the editor. */
	problems?: TriggerProblem[];
	/** Trailing "Next run ..." text for a schedule row. */
	nextRun?: ReactNode;
	disabled?: boolean;
}

/**
 * One trigger, rendered as a sentence.
 *
 * This knows nothing about any provider. It finds the one that owns the config
 * and hands it the row's state; the provider decides what words and chips the
 * sentence is made of. Row chrome — the leading icon and the remove button —
 * lives here so every provider's row looks the same.
 */
export function TriggerSentence({
	trigger,
	onChange,
	onRemove,
	options,
	problems,
	nextRun,
	disabled,
}: TriggerSentenceProps) {
	const config = trigger.config;
	const provider = providerFor(config);
	const Icon = provider.icon;

	// A banner naming the row is not enough when a sentence has three chips that
	// could each be the empty one.
	const invalid = new Set((problems ?? []).map((p) => p.field));

	return (
		<div className="group flex min-h-10 flex-wrap items-center gap-1.5 rounded-[8px] px-2 py-1.5 hover:bg-foreground/[0.03]">
			<Icon className="size-4 shrink-0 text-muted-foreground" />

			{provider.renderSentence(config, {
				triggerId: trigger.id,
				set: (patch) =>
					onChange({ ...trigger, config: { ...config, ...patch } as never }),
				mark: (field) => (invalid.has(field) ? CHIP_INVALID : undefined),
				options,
				disabled,
				nextRun,
			})}

			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label="Remove trigger"
				disabled={disabled}
				onClick={onRemove}
				className="ml-auto size-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground"
			>
				<LuTrash2 className="size-3.5" />
			</Button>
		</div>
	);
}
