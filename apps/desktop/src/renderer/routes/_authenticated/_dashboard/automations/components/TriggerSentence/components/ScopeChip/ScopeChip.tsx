import type { TriggerScope } from "@superset/shared/automation-triggers";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuCheck, LuPlus, LuRefreshCw } from "react-icons/lu";
import type { OptionGroupState } from "../../../providers/types";
import type { ScopeOption } from "../../scopeOption";
import { ChipButton } from "../ChipButton";

function scopeLabel(
	scope: TriggerScope,
	options: ScopeOption[],
	emptyLabel: string,
	anyLabel: string,
	countNoun: { singular: string; plural: string } | undefined,
	loading: boolean,
): string {
	if (scope.mode === "any") return anyLabel;
	if (scope.mode === "me") return "Me";
	if (scope.ids.length === 0) return emptyLabel;
	if (scope.ids.length === 1) {
		const match = options.find((o) => o.id === scope.ids[0]);
		if (match) return match.label;
		// The label list just hasn't arrived; the raw id would read as breakage.
		if (loading) return "…";
		return scope.ids[0] ?? emptyLabel;
	}
	return countNoun
		? `${scope.ids.length} ${scope.ids.length === 1 ? countNoun.singular : countNoun.plural}`
		: `${scope.ids.length} selected`;
}

/**
 * Multi-select over a known set, plus an explicit "any".
 *
 * "Any" is its own entry rather than the empty state, because an empty
 * selection matches nothing — that asymmetry is what stops a half-built trigger
 * firing on everything, so choosing "any" has to be deliberate.
 *
 * A combobox, not a menu: the search stays pinned while the list scrolls, and
 * what was selected when the picker opened is pulled into a "Selected" group at
 * the top. The pull happens on open, not per toggle — rows that jumped between
 * groups as you tick them would leave every next click aimed at a moved target.
 *
 * `allowCustom` folds pasted values into the same search field — a matching
 * query filters the list, a foreign one (an email, a channel id) gets a row
 * offering to use it verbatim. `state` distinguishes the three faces of an
 * empty list: loading, provider unreachable, and genuinely nothing.
 */
export function ScopeChip({
	scope,
	onChange,
	options,
	emptyLabel,
	anyLabel,
	allowAny = true,
	allowMe = false,
	single = false,
	countNoun,
	allowCustom,
	action,
	state,
	disabled,
	className,
}: {
	scope: TriggerScope;
	onChange: (next: TriggerScope) => void;
	options: ScopeOption[];
	emptyLabel: string;
	anyLabel: string;
	/**
	 * Whether "any" is offered in the picker. Off where it would overpromise —
	 * Slack channels, where events only arrive from channels the bot is in.
	 * `anyLabel` stays required either way: a config already saved as "any"
	 * still needs its chip labelled.
	 */
	allowAny?: boolean;
	/**
	 * One value, not a set: picking a row replaces the selection and closes.
	 * For repositories, whose branches and labels can only be listed once a
	 * single repository is known.
	 */
	single?: boolean;
	/** "2 channels" instead of the generic "2 selected". */
	countNoun?: { singular: string; plural: string };
	/** Search placeholder doubling as the invitation to paste/type a value. */
	allowCustom?: { placeholder: string };
	/**
	 * An escape hatch in the footer for when the list itself is short of the
	 * right entry — "Add repositories" opening the GitHub App install flow.
	 */
	action?: { label: string; onSelect: () => void };
	/**
	 * Offer a pinned "Me" row under "Anyone", saved as `{mode:"me"}` and
	 * resolved to the automation owner's identity when each event arrives —
	 * never a copied id, so reconnecting a different account moves it.
	 */
	allowMe?: boolean;
	state?: OptionGroupState;
	disabled?: boolean;
	className?: string;
}) {
	const selected = scope.mode === "list" ? scope.ids : [];
	const isAny = scope.mode === "any";
	const isMe = scope.mode === "me";
	const empty = scope.mode === "list" && !scope.ids.length;
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const openChange = (next: boolean) => {
		setOpen(next);
		if (next) setQuery("");
	};

	const toggle = (id: string) => {
		if (single) {
			onChange({ mode: "list", ids: [id] });
			setOpen(false);
			return;
		}
		const next = selected.includes(id)
			? selected.filter((s) => s !== id)
			: [...selected, id];
		onChange({ mode: "list", ids: next });
	};

	const addCustom = () => {
		const value = query.trim();
		if (!value) return;
		if (!selected.includes(value)) {
			onChange({ mode: "list", ids: [...selected, value] });
		}
		setQuery("");
	};

	// Live, not snapshotted on open: ticking a row moves it into "Selected"
	// right away, so the group always states the truth.
	const selectedRows = selected.map((id) => {
		const option = options.find((o) => o.id === id);
		return { id, label: option?.label ?? id, hint: option?.hint };
	});
	const restRows = options.filter((option) => !selected.includes(option.id));

	const trimmed = query.trim();
	const offersCustom =
		allowCustom !== undefined &&
		trimmed !== "" &&
		!selected.includes(trimmed) &&
		!options.some((option) => option.id === trimmed);

	// Capitalized for a group heading: "channels" → "Channels".
	const restHeading = countNoun
		? countNoun.plural.charAt(0).toUpperCase() + countNoun.plural.slice(1)
		: "Options";

	const row = ({
		id,
		label,
		hint,
	}: {
		id: string;
		label: string;
		hint?: string;
	}) => (
		<CommandItem
			key={id}
			// The hint and id are part of the match target, so searching an owner
			// org or a pasted id finds the row instead of offering to add it twice.
			value={`${label} ${hint ?? ""} ${id}`}
			onSelect={() => toggle(id)}
		>
			{single ? (
				<LuCheck
					className={cn(
						"size-4 shrink-0",
						!selected.includes(id) && "invisible",
					)}
				/>
			) : (
				<Checkbox
					checked={selected.includes(id)}
					className="pointer-events-none"
				/>
			)}
			{/* The checkbox column already says these are channels; the # prefix
			    on every row is noise the sentence chip still keeps. */}
			{label.replace(/^#/, "")}
			{hint && <span className="text-muted-foreground text-xs">{hint}</span>}
		</CommandItem>
	);

	return (
		<Popover open={open} onOpenChange={openChange}>
			<PopoverTrigger asChild disabled={disabled}>
				<span>
					<ChipButton
						label={scopeLabel(
							scope,
							options,
							emptyLabel,
							anyLabel,
							countNoun,
							state?.isLoading ?? false,
						)}
						empty={empty}
						disabled={disabled}
						className={className}
					/>
				</span>
			</PopoverTrigger>
			{/* Clamped to the space Radix has on screen, with the list as the part
			    that gives: input and refresh stay put, the rows scroll. */}
			<PopoverContent
				align="start"
				collisionPadding={8}
				className="flex max-h-[min(400px,var(--radix-popover-content-available-height))] w-80 flex-col p-0"
			>
				<Command className="min-h-0">
					<CommandInput
						autoFocus
						value={query}
						onValueChange={setQuery}
						placeholder={allowCustom?.placeholder ?? "Search..."}
					/>
					<CommandList className="flex-1">
						{!offersCustom && <CommandEmpty>No matches</CommandEmpty>}

						{allowAny && !trimmed && (
							<CommandItem
								value={anyLabel}
								onSelect={() =>
									onChange(isAny ? { mode: "list", ids: [] } : { mode: "any" })
								}
							>
								<Checkbox checked={isAny} className="pointer-events-none" />
								{anyLabel}
							</CommandItem>
						)}

						{allowMe && !trimmed && (
							<CommandItem
								value="Me"
								onSelect={() =>
									onChange(isMe ? { mode: "list", ids: [] } : { mode: "me" })
								}
							>
								<Checkbox checked={isMe} className="pointer-events-none" />
								Me
							</CommandItem>
						)}

						{/* One list when single: with nothing to accumulate there is no
						    selection to gather at the top, and a row that jumped groups
						    on click would move the target under the next one. */}
						{single ? (
							options.length > 0 && (
								<CommandGroup heading={restHeading}>
									{options.map((option) =>
										row({
											id: option.id,
											label: option.label,
											hint: option.hint,
										}),
									)}
								</CommandGroup>
							)
						) : (
							<>
								{selectedRows.length > 0 && (
									<CommandGroup heading="Selected">
										{selectedRows.map(row)}
									</CommandGroup>
								)}
								{restRows.length > 0 && (
									<CommandGroup heading={restHeading}>
										{restRows.map(row)}
									</CommandGroup>
								)}
							</>
						)}

						{/* Always matches — its value is the query itself. */}
						{offersCustom && (
							<CommandItem value={query} onSelect={addCustom}>
								Use "{trimmed}"
							</CommandItem>
						)}

						{options.length === 0 &&
							(state?.isLoading ? (
								<CommandItem disabled>Loading…</CommandItem>
							) : state?.isError ? (
								<CommandItem onSelect={() => state.refetch()}>
									Couldn't load — retry
								</CommandItem>
							) : (
								!allowCustom && (
									<CommandItem disabled>Nothing to choose yet</CommandItem>
								)
							))}
					</CommandList>

					{/* Below the scroll, not in it: reachable however long the list.
					    Both show with an empty roster — that is exactly when "Add
					    repositories" is the way forward and when a list that failed to
					    load needs retrying. */}
					{(action || state) && (
						<div className="flex items-center border-t">
							{action && (
								<button
									type="button"
									onClick={action.onSelect}
									className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								>
									<LuPlus className="size-3.5" />
									{action.label}
								</button>
							)}
							{state && (
								<button
									type="button"
									disabled={state.isLoading}
									onClick={() => state.refetch()}
									className={cn(
										"flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50",
										action ? "ml-auto" : "w-full",
									)}
								>
									<LuRefreshCw
										className={cn(
											"size-3.5",
											state.isLoading && "animate-spin",
										)}
									/>
									{/* Sharing the row leaves no room for the noun. */}
									{action
										? "Refresh"
										: countNoun
											? `Refresh ${countNoun.plural}`
											: "Refresh"}
								</button>
							)}
						</div>
					)}
				</Command>
			</PopoverContent>
		</Popover>
	);
}
