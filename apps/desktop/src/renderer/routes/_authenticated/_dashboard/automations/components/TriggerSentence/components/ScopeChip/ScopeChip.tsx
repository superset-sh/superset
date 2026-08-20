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
import type { ScopeOption } from "../../scopeOption";
import { ChipButton } from "../ChipButton";

function scopeLabel(
	scope: TriggerScope,
	options: ScopeOption[],
	emptyLabel: string,
	anyLabel: string,
): string {
	if (scope.mode === "any") return anyLabel;
	if (scope.ids.length === 0) return emptyLabel;
	if (scope.ids.length === 1) {
		const match = options.find((o) => o.id === scope.ids[0]);
		return match?.label ?? scope.ids[0] ?? emptyLabel;
	}
	return `${scope.ids.length} selected`;
}

/**
 * Multi-select over a known set, plus an explicit "any".
 *
 * "Any" is its own entry rather than the empty state, because an empty
 * selection matches nothing — that asymmetry is what stops a half-built trigger
 * firing on everything, so choosing "any" has to be deliberate.
 *
 * `allowCustom` adds a field for values that are not pickable — an email
 * address, a domain — which then sit in the list like any chosen option.
 */
export function ScopeChip({
	scope,
	onChange,
	options,
	emptyLabel,
	anyLabel,
	allowCustom,
	disabled,
	className,
}: {
	scope: TriggerScope;
	onChange: (next: TriggerScope) => void;
	options: ScopeOption[];
	emptyLabel: string;
	anyLabel: string;
	allowCustom?: { placeholder: string };
	disabled?: boolean;
	className?: string;
}) {
	const selected = scope.mode === "list" ? scope.ids : [];
	const isAny = scope.mode === "any";
	const empty = scope.mode === "list" && !scope.ids.length;
	const [custom, setCustom] = useState("");

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

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<span>
					<ChipButton
						label={scopeLabel(scope, options, emptyLabel, anyLabel)}
						empty={empty}
						disabled={disabled}
						className={className}
					/>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
				<DropdownMenuCheckboxItem
					checked={isAny}
					onCheckedChange={() =>
						onChange(isAny ? { mode: "list", ids: [] } : { mode: "any" })
					}
				>
					{anyLabel}
				</DropdownMenuCheckboxItem>
				{options.map((option) => (
					<DropdownMenuCheckboxItem
						key={option.id}
						checked={selected.includes(option.id)}
						onCheckedChange={() => toggle(option.id)}
					>
						{option.label}
					</DropdownMenuCheckboxItem>
				))}
				{allowCustom &&
					customSelected.map((id) => (
						<DropdownMenuCheckboxItem
							key={id}
							checked
							onCheckedChange={() => toggle(id)}
						>
							{id}
						</DropdownMenuCheckboxItem>
					))}
				{options.length === 0 && !allowCustom && (
					<DropdownMenuItem disabled>Nothing to choose yet</DropdownMenuItem>
				)}
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
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
