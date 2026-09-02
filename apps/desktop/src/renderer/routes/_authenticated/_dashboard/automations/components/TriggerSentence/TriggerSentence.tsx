import type {
	DraftTrigger,
	TriggerProblem,
} from "@superset/shared/automation-triggers";
import { INTEGRATIONS } from "@superset/shared/integrations";
import { Button } from "@superset/ui/button";
import type { ReactNode } from "react";
import { LuArrowUpRight, LuTrash2 } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { type ProviderOptions, providerFor } from "../providers";
import { triggerEventLabel } from "../providers/eventLabel";
import type { OptionGroupState } from "../providers/types";
import { CHIP_INVALID } from "./chipStyles";

interface TriggerSentenceProps {
	trigger: DraftTrigger;
	onChange: (next: DraftTrigger) => void;
	onRemove: () => void;
	options: ProviderOptions;
	optionState?: Record<string, OptionGroupState>;
	/** This row's problems, already filtered to it by the editor. */
	problems?: TriggerProblem[];
	/** Trailing "Next run ..." text for a schedule row. */
	nextRun?: ReactNode;
	/**
	 * True when this provider needs an integration nobody has connected yet.
	 * The row collapses to the trigger's name and the way to fix it: with no
	 * connection there is nothing to populate the pickers, so a sentence full
	 * of empty ones would only ask for choices that cannot be made.
	 */
	requiresConnection?: boolean;
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
	optionState,
	problems,
	nextRun,
	requiresConnection,
	disabled,
}: TriggerSentenceProps) {
	const config = trigger.config;
	const provider = providerFor(config);
	const Icon = provider.icon;

	// A banner naming the row is not enough when a sentence has three chips that
	// could each be the empty one.
	const invalid = new Set((problems ?? []).map((p) => p.field));

	// The web app owns every connect flow, because that is where the browser
	// session lives; this only has to point at the right page.
	const webPath = INTEGRATIONS.find(
		(integration) => integration.provider === provider.connectionProvider,
	)?.webPath;

	// Always the first element of the right-hand cluster, so whatever follows
	// it — nothing, or a Connect button — is what sits against the row's right
	// padding, mirroring the icon's inset on the left.
	const removeButton = (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			aria-label="Remove trigger"
			disabled={disabled}
			onClick={onRemove}
			className="ml-auto size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground"
		>
			<LuTrash2 className="size-3.5" />
		</Button>
	);

	return (
		// select-text: the renderer body sets user-select: none, and the
		// sentence is prose that opts back in.
		<div className="group flex min-h-10 select-text flex-wrap items-center gap-1.5 rounded-[8px] px-2 py-1.5 hover:bg-foreground/[0.03]">
			{/* mr-1.5 on top of the row's gap-1.5 puts 12px after the icon. Wider
			    than the row's own 8px inset on purpose: the brand glyphs do not
			    fill their 16px box, so a gap that measures even reads tight. */}
			<Icon className="mr-1.5 size-4 shrink-0 text-muted-foreground" />

			{requiresConnection ? (
				<>
					<span className="text-[13px]">
						{triggerEventLabel(provider, config)}
					</span>
					<span className="text-[13px] text-amber-500">
						Requires connection
					</span>
					{removeButton}
					{webPath && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() =>
								window.open(`${env.NEXT_PUBLIC_WEB_URL}${webPath}`, "_blank")
							}
							className="h-7 shrink-0 gap-1 border-amber-500/40 bg-amber-500/10 px-2.5 text-amber-700 text-xs hover:bg-amber-500/20 dark:text-amber-400"
						>
							Connect
							<LuArrowUpRight className="size-3.5" />
						</Button>
					)}
				</>
			) : (
				provider.renderSentence(config, {
					triggerId: trigger.id,
					set: (patch) =>
						onChange({ ...trigger, config: { ...config, ...patch } as never }),
					mark: (field) => (invalid.has(field) ? CHIP_INVALID : undefined),
					options,
					// The one place a provider's group becomes its state; sentences
					// never name the group, so they cannot name the wrong one.
					state: provider.optionGroup
						? optionState?.[provider.optionGroup]
						: undefined,
					disabled,
					nextRun,
				})
			)}

			{!requiresConnection && removeButton}
		</div>
	);
}
