import type { TriggerScope } from "@superset/shared/automation-triggers";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { LuRefreshCw } from "react-icons/lu";
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
 * `allowCustom` adds a field for values that are not pickable — an email
 * address, a pasted channel id — which then sit in the list like any chosen
 * option. `state` distinguishes the three faces of an empty list: loading,
 * provider unreachable, and genuinely nothing.
 */
export function ScopeChip({
	scope,
	onChange,
	options,
	emptyLabel,
	anyLabel,
	countNoun,
	allowCustom,
	state,
	disabled,
	className,
}: {
	scope: TriggerScope;
	onChange: (next: TriggerScope) => void;
	options: ScopeOption[];
	emptyLabel: string;
	anyLabel: string;
	/** "2 channels" instead of the generic "2 selected". */
	countNoun?: { singular: string; plural: string };
	allowCustom?: { placeholder: string };
	state?: OptionGroupState;
	disabled?: boolean;
	className?: string;
}) {
	const selected = scope.mode === "list" ? scope.ids : [];
	const isAny = scope.mode === "any";
	const empty = scope.mode === "list" && !scope.ids.length;
	const [custom, setCustom] = useState("");
	const [filter, setFilter] = useState("");

	const toggle = (id: string) => {
		const next = selected.includes(id)
			? selected.filter((s) => s !== id)
			: [...selected, id];
		onChange({ mode: "list", ids: next });
	};

	const addCustom = () => {
		const value = custom.trim();
		if (!value) return;
		if (!selected.includes(value)) {
			onChange({ mode: "list", ids: [...selected, value] });
		}
		setCustom("");
	};

	// Typed values that no option describes still need a row to be unticked.
	const customSelected = selected.filter(
		(id) => !options.some((option) => option.id === id),
	);

	const query = filter.trim().toLowerCase();
	const shown = query
		? options.filter((option) => option.label.toLowerCase().includes(query))
		: options;

	return (
		<DropdownMenu onOpenChange={() => setFilter("")}>
			<DropdownMenuTrigger asChild disabled={disabled}>
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
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
				{/* A list short enough to scan doesn't need a second control. */}
				{options.length > 8 && (
					<Input
						autoFocus
						value={filter}
						placeholder="Search..."
						onChange={(event) => setFilter(event.target.value)}
						// Radix would typeahead-jump on printable keys; Escape and the
						// arrows still belong to the menu.
						onKeyDown={(event) => {
							if (event.key.length === 1 || event.key === "Backspace") {
								event.stopPropagation();
							}
						}}
						className="mb-1 h-7 border-none bg-transparent px-2 text-[13px] shadow-none focus-visible:ring-0 dark:bg-transparent"
					/>
				)}
				{!query && (
					<DropdownMenuCheckboxItem
						checked={isAny}
						onCheckedChange={() =>
							onChange(isAny ? { mode: "list", ids: [] } : { mode: "any" })
						}
					>
						{anyLabel}
					</DropdownMenuCheckboxItem>
				)}
				{shown.map((option) => (
					<DropdownMenuCheckboxItem
						key={option.id}
						checked={selected.includes(option.id)}
						onCheckedChange={() => toggle(option.id)}
					>
						{option.label}
					</DropdownMenuCheckboxItem>
				))}
				{query && shown.length === 0 && (
					<DropdownMenuItem disabled>No matches</DropdownMenuItem>
				)}
				{!query &&
					allowCustom &&
					customSelected.map((id) => (
						<DropdownMenuCheckboxItem
							key={id}
							checked
							onCheckedChange={() => toggle(id)}
						>
							{id}
						</DropdownMenuCheckboxItem>
					))}
				{options.length === 0 &&
					(state?.isLoading ? (
						<DropdownMenuItem disabled>Loading…</DropdownMenuItem>
					) : state?.isError ? (
						<DropdownMenuItem onSelect={() => state.refetch()}>
							Couldn't load — retry
						</DropdownMenuItem>
					) : (
						!allowCustom && (
							<DropdownMenuItem disabled>
								Nothing to choose yet
							</DropdownMenuItem>
						)
					))}
				{allowCustom && (
					<>
						<DropdownMenuSeparator />
						<div className="p-1">
							<Input
								value={custom}
								placeholder={allowCustom.placeholder}
								disabled={disabled}
								onChange={(event) => setCustom(event.target.value)}
								// The menu owns arrow keys and typeahead; the field keeps
								// what it types.
								onKeyDown={(event) => {
									event.stopPropagation();
									if (event.key === "Enter") {
										event.preventDefault();
										addCustom();
									}
								}}
								className="h-7 text-[13px]"
							/>
						</div>
					</>
				)}
				{state && options.length > 0 && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							disabled={state.isLoading}
							onSelect={(event) => {
								// Keep the menu open: refreshing is a step, not a choice.
								event.preventDefault();
								state.refetch();
							}}
						>
							<LuRefreshCw className="size-3.5" />
							Refresh
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
