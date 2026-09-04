import {
	type DraftTrigger,
	enabledTriggerKinds,
	type TriggerProblem,
} from "@superset/shared/automation-triggers";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Separator } from "@superset/ui/separator";
import { useFeatureFlagPayload } from "posthog-js/react";
import { type ReactNode, useMemo, useState } from "react";
import { LuPlus } from "react-icons/lu";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { providerFor, TRIGGER_PROVIDERS } from "../providers";
import type { OptionGroupState, ProviderOptions } from "../providers/types";
import { useProviderConnections } from "../providers/useProviderConnections";
import { TriggerSentence } from "../TriggerSentence";
import { RuntimeWarnings } from "./components/RuntimeWarnings";
import { collectRuntimeWarnings, lockedTierFor } from "./runtimeWarnings";
import { TriggerMenuItems } from "./TriggerMenuItems";
import { flattenTriggerMenu, matchesQuery } from "./triggerMenu";

type ScheduleTriggerConfig = Extract<
	DraftTrigger["config"],
	{ kind: "schedule" }
>;

interface TriggersEditorProps {
	drafts: DraftTrigger[];
	onEdit: (next: DraftTrigger[]) => void;
	problems: TriggerProblem[];
	options: ProviderOptions;
	optionState: Record<string, OptionGroupState>;
	organizationId: string;
	renderNextRun?: (config: ScheduleTriggerConfig) => ReactNode;
	readOnly?: boolean;
	children?: ReactNode;
}

export function TriggersEditor({
	drafts,
	onEdit,
	problems,
	options,
	optionState,
	organizationId,
	renderNextRun,
	readOnly,
	children,
}: TriggersEditorProps) {
	const add = (config: DraftTrigger["config"]) =>
		onEdit([...drafts, { config }]);

	const { plan } = useCurrentPlan();
	const { connected, isPending: connectionsPending } =
		useProviderConnections(organizationId);

	const missingConnection = (config: DraftTrigger["config"]) => {
		if (connectionsPending) return false;
		const required = providerFor(config).connectionProvider;
		return required !== undefined && !connected[required];
	};

	const runtimeWarnings = useMemo(
		() => collectRuntimeWarnings(drafts, options, plan),
		[drafts, options, plan],
	);

	const enabledKinds = useFeatureFlagPayload(
		FEATURE_FLAGS.AUTOMATION_EVENT_TRIGGERS,
	);
	const providers = useMemo(() => {
		const kinds = enabledTriggerKinds(enabledKinds);
		return TRIGGER_PROVIDERS.filter(
			(provider) => provider.kind === "schedule" || kinds.has(provider.kind),
		);
	}, [enabledKinds]);

	const [query, setQuery] = useState("");
	// Locked providers stay in the menu but can't be added, so aren't indexed.
	const leaves = useMemo(
		() =>
			flattenTriggerMenu(
				providers.filter((provider) => !lockedTierFor(provider, plan)),
			),
		[providers, plan],
	);
	const results = query
		? leaves.filter((leaf) => matchesQuery(leaf, query))
		: [];

	return (
		<div className="flex flex-col gap-1">
			<div className="mb-2 flex min-h-7 items-center gap-3">
				<span className="shrink-0 text-muted-foreground text-sm">Triggers</span>
			</div>

			<div className="rounded-[12px] bg-foreground/[0.04] p-1">
				{drafts.map((trigger, index) => (
					<TriggerSentence
						key={trigger.id ?? `draft-${index}`}
						trigger={trigger}
						onChange={(next) =>
							onEdit(drafts.map((t, i) => (i === index ? next : t)))
						}
						onRemove={() => onEdit(drafts.filter((_, i) => i !== index))}
						options={options}
						optionState={optionState}
						problems={problems.filter((p) => p.index === index)}
						nextRun={
							trigger.config.kind === "schedule"
								? renderNextRun?.(trigger.config)
								: undefined
						}
						requiresConnection={missingConnection(trigger.config)}
						disabled={readOnly}
					/>
				))}

				{drafts.length > 0 && (
					<Separator className="mx-2 mb-1.5 bg-border/60 data-[orientation=horizontal]:w-auto" />
				)}

				<DropdownMenu onOpenChange={() => setQuery("")}>
					<DropdownMenuTrigger asChild disabled={readOnly}>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-10 w-full justify-start gap-1.5 rounded-[8px] px-2 font-normal text-[13px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
						>
							<LuPlus className="size-4" />
							Add Trigger
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-70">
						{/* Radix's typeahead would swallow these keys; arrows/Escape still pass. */}
						{leaves.length > 1 && (
							<Input
								autoFocus
								value={query}
								placeholder="Search triggers..."
								onChange={(event) => setQuery(event.target.value)}
								onKeyDown={(event) => {
									if (event.key.length === 1 || event.key === "Backspace") {
										event.stopPropagation();
									}
								}}
								className="mb-1 h-8 border-none bg-transparent px-2 text-[13px] shadow-none focus-visible:ring-0 dark:bg-transparent"
							/>
						)}

						{query ? (
							<>
								{results.map((leaf) => {
									const Icon = leaf.icon;
									return (
										<DropdownMenuItem
											key={leaf.path.join(">")}
											onSelect={() => add(leaf.create())}
										>
											<Icon className="size-3.5 shrink-0 text-current" />
											{/* The trail disambiguates "Approved" from the other three
											    review outcomes, but it is the trail that gives way when
											    the row is too narrow — truncating the leaf would hide
											    the word that was searched for. */}
											{leaf.path.length > 1 && (
												<span className="truncate text-muted-foreground">
													{`${leaf.path.slice(0, -1).join(" › ")} › `}
												</span>
											)}
											<span className="shrink-0">{leaf.path.at(-1)}</span>
										</DropdownMenuItem>
									);
								})}
								{results.length === 0 && (
									<DropdownMenuItem disabled>
										No matching trigger
									</DropdownMenuItem>
								)}
							</>
						) : (
							<TriggerMenuItems
								providers={providers}
								onPick={add}
								lockedLabel={(provider) => lockedTierFor(provider, plan)}
							/>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{children}

			{/* Below the surface and the scope line, like the save banner is above
			    them: these outlive any save, so they cannot live in the
			    submit-gated banner. */}
			<RuntimeWarnings warnings={runtimeWarnings} />
		</div>
	);
}
