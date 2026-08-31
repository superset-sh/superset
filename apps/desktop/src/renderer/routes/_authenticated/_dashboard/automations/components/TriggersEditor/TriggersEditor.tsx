import {
	type DraftTrigger,
	enabledTriggerKinds,
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
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { LuPlus, LuTriangleAlert } from "react-icons/lu";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { providerFor, TRIGGER_PROVIDERS } from "../providers";
import type { OptionGroupState } from "../providers/types";
import { useProviderConnections } from "../providers/useProviderConnections";
import { useProviderOptions } from "../providers/useProviderOptions";
import { TriggerSentence } from "../TriggerSentence";
import { RuntimeWarnings } from "./components/RuntimeWarnings";
import { useTriggerDrafts } from "./hooks/useTriggerDrafts";
import { collectRuntimeWarnings, lockedTierFor } from "./runtimeWarnings";
import { TriggerMenuItems } from "./TriggerMenuItems";
import { flattenTriggerMenu, matchesQuery } from "./triggerMenu";

type ScheduleTriggerConfig = Extract<
	DraftTrigger["config"],
	{ kind: "schedule" }
>;

interface TriggersEditorProps {
	triggers: DraftTrigger[];
	/** Resolves once the set is written; rejects if it was refused. */
	onChange: (next: DraftTrigger[]) => undefined | Promise<unknown>;
	/** Whose integrations the pickable lists come from. */
	organizationId: string;
	/**
	 * Trailing "Next run ..." text for a schedule row, computed from the draft
	 * config on screen — so unsaved rows have one too, and edits move it.
	 */
	renderNextRun?: (config: ScheduleTriggerConfig) => ReactNode;
	readOnly?: boolean;
	/**
	 * Rendered between the trigger surface and the runtime warnings — the scope
	 * line ("in X on Y using Z"), so warnings read as footnotes to the whole
	 * setup rather than wedging into the middle of it.
	 */
	children?: ReactNode;
}

/**
 * The trigger list for an automation.
 *
 * Holds drafts, not saved rows: a trigger can sit here half-configured while
 * someone is still choosing repositories, and the problems it reports are the
 * same ones the API would reject it with — the checks come from
 * `@superset/shared` rather than being restated here.
 */
export function TriggersEditor({
	triggers,
	onChange,
	organizationId,
	renderNextRun,
	readOnly,
	children,
}: TriggersEditorProps) {
	// Edited locally and saved on request, unlike the rest of this page.
	//
	// A trigger is invalid the moment it is added — "Comment added" with no
	// repository chosen yet — and the API rejects the whole set, so autosaving
	// meant a new row was saved, refused, and dropped on the next render. Saving
	// silently once it happened to become valid is no better: nothing tells you
	// which edit crossed the line, or that anything was written at all.
	const optionStateRef = useRef<Record<string, OptionGroupState>>({});
	// Saving joins the bot to the public channels a Slack trigger watches, which
	// flips `botMember` on the cached channel list. Without a refetch the
	// membership warning outlives the save that fixed it.
	const saveTriggers = useCallback(
		async (next: DraftTrigger[]) => {
			const result = await onChange(next);
			optionStateRef.current.slack?.refetch();
			return result;
		},
		[onChange],
	);

	const {
		drafts,
		dirty,
		saving,
		shownProblems,
		banner,
		edit,
		add,
		save,
		discard,
	} = useTriggerDrafts(triggers, saveTriggers);
	const { options, state: optionState } = useProviderOptions(
		organizationId,
		drafts,
	);
	// Read through a ref: the save handler is defined before this hook runs, and
	// it only needs whichever refetch exists by the time a save resolves.
	useEffect(() => {
		optionStateRef.current = optionState;
	}, [optionState]);

	// Unlike problems, these show without waiting for a save attempt: they
	// describe the world (a channel the bot is not in), not an unfinished edit,
	// and the person who can fix them may not be the one editing.
	const { plan } = useCurrentPlan();
	const { connected, isPending: connectionsPending } =
		useProviderConnections(organizationId);

	// Unknown is not disconnected: until the first answer lands, a row must not
	// accuse a perfectly good integration of being missing.
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
	// Locked providers stay in the menu — the tier badge answers "where's
	// Slack?" — but can't be added, so search doesn't index them.
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
			{/* The section label lives here rather than in the page, so the actions
			    for the set can sit on its line. Above the surface, not below it: a
			    Save that trails the rows drifts down the page as triggers are added,
			    and takes the reason it was refused with it. */}
			<div className="mb-2 flex min-h-7 items-center gap-3">
				<span className="shrink-0 text-muted-foreground text-sm">Triggers</span>

				{banner && (
					<p className="flex min-w-0 items-center gap-1.5 text-[13px] text-amber-600 dark:text-amber-400">
						<LuTriangleAlert className="size-3.5 shrink-0" />
						<span className="truncate">{banner}</span>
					</p>
				)}

				{dirty && (
					<div className="ml-auto flex shrink-0 items-center gap-1.5">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={discard}
							disabled={saving}
							className="h-7 text-[13px]"
						>
							Discard
						</Button>
						<Button
							type="button"
							size="sm"
							onClick={save}
							disabled={saving}
							className="h-7 text-[13px]"
						>
							{saving ? "Saving..." : "Save triggers"}
						</Button>
					</div>
				)}
			</div>

			{/* A filled surface, not an outlined box: the rows are the structure, and
			    a border around them competes with the card they already sit in. */}
			<div className="rounded-[12px] bg-foreground/[0.04] p-1">
				{drafts.map((trigger, index) => (
					<TriggerSentence
						key={trigger.id ?? `draft-${index}`}
						trigger={trigger}
						onChange={(next) =>
							edit(drafts.map((t, i) => (i === index ? next : t)))
						}
						onRemove={() => edit(drafts.filter((_, i) => i !== index))}
						options={options}
						optionState={optionState}
						problems={shownProblems.filter((p) => p.index === index)}
						nextRun={
							trigger.config.kind === "schedule"
								? renderNextRun?.(trigger.config)
								: undefined
						}
						requiresConnection={missingConnection(trigger.config)}
						disabled={readOnly}
					/>
				))}

				{/* Separates the rows from the action, inset so it reads as a rule
				    inside the surface rather than a division of the card. The bottom
				    margin matches the row padding above it, so the rule sits centred
				    in the gap rather than against the button. */}
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
						{/* Radix runs a typeahead on printable keys and would swallow what
					    is being typed here; Escape and the arrows still need to reach
					    the menu, so only the characters are stopped. */}
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
