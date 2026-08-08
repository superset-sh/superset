import { ContextMenuItem } from "@superset/ui/context-menu";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { HiCheck } from "react-icons/hi2";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";

export type ColorMenuKind = "context" | "dropdown";

interface ColorMenuItemsProps {
	kind: ColorMenuKind;
	/** The stored colour; both null and the sentinel mean "Default". */
	color: string | null | undefined;
	/** Receives null for "Default" so callers clear rather than store it. */
	onSelect: (color: string | null) => void;
}

/**
 * The colour options behind every sidebar "Set … color" submenu (folders and
 * project groups). Shared so the option list, the null-for-default contract and
 * the selected-state styling can't drift apart between the two menus.
 */
export function ColorMenuItems({ kind, color, onSelect }: ColorMenuItemsProps) {
	const Item = kind === "context" ? ContextMenuItem : DropdownMenuItem;
	const selectedValue = color ?? PROJECT_COLOR_DEFAULT;
	const options = [
		{ name: "Default", value: PROJECT_COLOR_DEFAULT },
		...PROJECT_COLORS,
	];

	return (
		<>
			{options.map((option) => {
				const isDefault = option.value === PROJECT_COLOR_DEFAULT;

				return (
					<Item
						key={option.value}
						onSelect={(event: Event) => {
							// These menus hang off rows that handle their own clicks.
							event.stopPropagation();
							onSelect(isDefault ? null : option.value);
						}}
					>
						<span
							className="relative inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border border-border/50"
							style={isDefault ? undefined : { backgroundColor: option.value }}
						>
							{isDefault && (
								<span className="size-1.5 rounded-full bg-muted-foreground/35" />
							)}
						</span>
						<span>{option.name}</span>
						{selectedValue === option.value && (
							<HiCheck className="ml-auto size-3.5 text-muted-foreground" />
						)}
					</Item>
				);
			})}
		</>
	);
}
