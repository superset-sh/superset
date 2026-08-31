import type { TriggerScope } from "@superset/shared/automation-triggers";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { LuCheck } from "react-icons/lu";
import { ChipButton } from "../../../../TriggerSentence/components/ChipButton";
import type { ScopeOption } from "../../../../TriggerSentence/scopeOption";
import { SEPARATORS_WITH_SPACE, TokenField } from "../TokenField";

const ROW =
	"flex w-full items-center justify-between rounded-[6px] px-2 py-1.5 text-left text-sm hover:bg-accent";

/**
 * Who a GitHub trigger filters on: anyone, the automation's owner, or a named
 * set.
 *
 * A mode menu rather than a multi-select, because the roster this could offer
 * is usually empty — listing members needs a permission most installations
 * never granted, so the picker's own list is no help for exactly the people
 * most likely to be missing from it. "Specific People" therefore takes typed
 * GitHub usernames instead of only offering what we could enumerate.
 *
 * Typed names are stored as the login, roster picks as GitHub's numeric id,
 * and the matcher accepts either. The difference matters: an id survives a
 * rename and a login does not, so anything picked from the roster keeps the
 * stronger guarantee and only what someone typed carries the weaker one.
 */
export function UserScopeChip({
	scope,
	onChange,
	options,
	disabled,
	className,
}: {
	scope: TriggerScope;
	onChange: (next: TriggerScope) => void;
	/** Labels the ids saved by earlier roster picks; typed logins label themselves. */
	options: ScopeOption[];
	disabled?: boolean;
	className?: string;
}) {
	const [open, setOpen] = useState(false);

	const values = scope.mode === "list" ? scope.ids : [];
	const isList = scope.mode === "list";
	const valueLabel = (value: string) =>
		options.find((option) => option.id === value)?.label ?? value;

	const label =
		scope.mode === "any"
			? "Anyone"
			: scope.mode === "me"
				? "Me"
				: values.length === 0
					? "Specific People"
					: values.length === 1
						? valueLabel(values[0] ?? "")
						: `${values.length} people`;

	const pick = (next: TriggerScope) => {
		onChange(next);
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				if (disabled) return;
				setOpen(next);
			}}
		>
			<PopoverTrigger asChild>
				<span>
					<ChipButton
						label={label}
						// An empty set matches nobody and blocks saving, so it reads as
						// unset even though a mode was deliberately chosen.
						empty={isList && values.length === 0}
						disabled={disabled}
						className={className}
					/>
				</span>
			</PopoverTrigger>

			{isList ? (
				<PopoverContent align="start" className="w-72 p-2">
					<TokenField
						stripLeadingAt
						values={values}
						onChange={(ids) => onChange({ mode: "list", ids })}
						placeholder="GitHub username..."
						valueLabel={valueLabel}
						// A login has no spaces in it, so a space ends one.
						separators={SEPARATORS_WITH_SPACE}
						header="Users"
						// The only way back to Anyone and Me once this mode is on.
						onReset={() => pick({ mode: "any" })}
					/>
				</PopoverContent>
			) : (
				<PopoverContent align="start" className="w-56 p-1.5">
					<button
						type="button"
						className={ROW}
						onClick={() => pick({ mode: "any" })}
					>
						Anyone
						{scope.mode === "any" && <LuCheck className="size-4" />}
					</button>
					<button
						type="button"
						className={ROW}
						onClick={() => pick({ mode: "me" })}
					>
						Me
						{scope.mode === "me" && <LuCheck className="size-4" />}
					</button>
					{/* Stays open: the users field is the point of choosing this. */}
					<button
						type="button"
						className={ROW}
						onClick={() => onChange({ mode: "list", ids: [] })}
					>
						Specific People
					</button>
				</PopoverContent>
			)}
		</Popover>
	);
}
