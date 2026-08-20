import {
	type DraftTrigger,
	describeTriggerProblems,
	summarizeTriggerProblems,
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
import { LuCirclePlus, LuTriangleAlert } from "react-icons/lu";
import { TRIGGER_PROVIDERS } from "../providers";
import { useProviderOptions } from "../providers/useProviderOptions";
import { TriggerSentence } from "../TriggerSentence";
import { TriggerMenuItems } from "./TriggerMenuItems";
import { flattenTriggerMenu, matchesQuery } from "./triggerMenu";

interface TriggersEditorProps {
	triggers: DraftTrigger[];
	/** Resolves once the set is written; rejects if it was refused. */
	onChange: (next: DraftTrigger[]) => undefined | Promise<unknown>;
	/** Whose integrations the pickable lists come from. */
	organizationId: string;
	/** Trailing "Next run ..." text for one schedule row, by trigger id. */
	renderNextRun?: (triggerId?: string) => ReactNode;
	readOnly?: boolean;
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
}: TriggersEditorProps) {
	// Edited locally and saved on request, unlike the rest of this page.
	//
	// A trigger is invalid the moment it is added — "Comment added" with no
	// repository chosen yet — and the API rejects the whole set, so autosaving
	// meant a new row was saved, refused, and dropped on the next render. Saving
	// silently once it happened to become valid is no better: nothing tells you
	// which edit crossed the line, or that anything was written at all.
	const [drafts, setDrafts] = useState(triggers);
	const options = useProviderOptions(organizationId, drafts);
	const [dirty, setDirty] = useState(false);
	const savedKey = JSON.stringify(triggers);
	const [prevSavedKey, setPrevSavedKey] = useState(savedKey);
	if (savedKey !== prevSavedKey) {
		setPrevSavedKey(savedKey);
		// Adopt what was saved — it carries the ids the server assigned — unless
		// there are edits here, which by definition were never sent.
		if (!dirty) setDrafts(triggers);
	}

	const problems = useMemo(() => describeTriggerProblems(drafts), [drafts]);

	// Nothing is wrong until someone says they are done. Every trigger is
	// incomplete the instant it is added, so validating as you type marks a row
	// before anyone has had the chance to fill it in — the complaint lands
	// before the work. After a rejected save the problems stay live, so they
	// clear as each one is fixed rather than only on the next attempt.
	const [submitted, setSubmitted] = useState(false);
	const shownProblems = submitted ? problems : [];
	const banner = submitted ? summarizeTriggerProblems(problems) : null;

	const enabledKinds = useFeatureFlagPayload(
		FEATURE_FLAGS.AUTOMATION_EVENT_TRIGGERS,
	);
	const providers = useMemo(() => {
		const kinds = new Set(
			Array.isArray(enabledKinds)
				? enabledKinds.filter((kind) => typeof kind === "string")
				: [],
		);
		return TRIGGER_PROVIDERS.filter(
			(provider) => provider.kind === "schedule" || kinds.has(provider.kind),
		);
	}, [enabledKinds]);

	const [query, setQuery] = useState("");
	const leaves = useMemo(() => flattenTriggerMenu(providers), [providers]);
	const results = query
		? leaves.filter((leaf) => matchesQuery(leaf, query))
		: [];

	const edit = (next: DraftTrigger[]) => {
		setDrafts(next);
		setDirty(true);
	};

	const [saving, setSaving] = useState(false);

	const save = async () => {
		// Always clickable: the button is what asks for validation, so disabling
		// it while the set is invalid would leave no way to find out why.
		setSubmitted(true);
		if (problems.length > 0) return;

		setSaving(true);
		try {
			await onChange(drafts);
			setDirty(false);
			setSubmitted(false);
		} catch {
			// Stay dirty and keep the edits: this editor holds the only copy of
			// them, and the mutation has already reported why it failed.
		} finally {
			setSaving(false);
		}
	};

	const discard = () => {
		setDrafts(triggers);
		setDirty(false);
		setSubmitted(false);
	};

	const add = (config: DraftTrigger["config"]) => edit([...drafts, { config }]);

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
						problems={shownProblems.filter((p) => p.index === index)}
						nextRun={
							trigger.config.kind === "schedule"
								? renderNextRun?.(trigger.id)
								: undefined
						}
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
							className="mb-1.5 h-10 w-full justify-start gap-2 rounded-[8px] px-2 font-normal text-[13px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
						>
							<LuCirclePlus className="size-4" />
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
							<TriggerMenuItems providers={providers} onPick={add} />
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
