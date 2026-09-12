import type { TriggerConfigInput } from "@superset/shared/automation-triggers";
import { Badge } from "@superset/ui/badge";
import {
	DropdownMenuItem,
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import type { TriggerMenuEntry, TriggerProvider } from "../../providers";
import { providerLabelText } from "../triggerMenu";

/**
 * The top level of the Add Trigger menu: one row per provider.
 *
 * A provider with a single leaf becomes that leaf directly — "Scheduled" adds a
 * schedule, it does not open a submenu containing "Scheduled". A provider with
 * more than one becomes a submenu holding its own tree.
 *
 * `text-current` on the icons is load-bearing: DropdownMenuItem forces any svg
 * without a `text-` class to muted-foreground, so brand marks would render grey
 * and stay grey while the row highlights. Inheriting means they follow the
 * row's colour on hover.
 */
export function TriggerMenuItems({
	providers,
	onPick,
	lockedLabel,
}: {
	providers: TriggerProvider[];
	onPick: (config: TriggerConfigInput) => void;
	/** Tier badge ("Pro", "Enterprise") for a provider the plan can't add. */
	lockedLabel?: (provider: TriggerProvider) => string | null;
}) {
	return (
		<>
			{providers.map((provider) => {
				const Icon = provider.icon;
				const badge = lockedLabel?.(provider);
				if (badge) {
					return (
						<DropdownMenuItem key={provider.kind} disabled>
							<Icon className="size-3.5 text-current" />
							{providerLabelText(provider.label)}
							<Badge variant="box" className="ml-auto">
								{badge}
							</Badge>
						</DropdownMenuItem>
					);
				}
				const only = provider.menu.length === 1 ? provider.menu[0] : undefined;

				if (only && "create" in only) {
					return (
						<DropdownMenuItem
							key={provider.kind}
							onSelect={() => onPick(only.create())}
						>
							<Icon className="size-3.5 text-current" />
							{providerLabelText(provider.label)}
						</DropdownMenuItem>
					);
				}

				return (
					<DropdownMenuSub key={provider.kind}>
						<DropdownMenuSubTrigger>
							<Icon className="size-3.5 text-current" />
							{providerLabelText(provider.label)}
						</DropdownMenuSubTrigger>
						<DropdownMenuPortal>
							<DropdownMenuSubContent className="max-h-96 overflow-y-auto">
								<MenuEntries entries={provider.menu} onPick={onPick} />
							</DropdownMenuSubContent>
						</DropdownMenuPortal>
					</DropdownMenuSub>
				);
			})}
		</>
	);
}

/**
 * A provider's subtree, at any depth. Recursive rather than one level per
 * provider: GitHub already nests twice ("PR review submitted…" → "Approved"),
 * and the next provider will nest differently.
 */
function MenuEntries({
	entries,
	onPick,
}: {
	entries: TriggerMenuEntry[];
	onPick: (config: TriggerConfigInput) => void;
}) {
	return (
		<>
			{entries.map((entry) =>
				"children" in entry ? (
					<DropdownMenuSub key={providerLabelText(entry.label)}>
						<DropdownMenuSubTrigger>
							{providerLabelText(entry.label)}
						</DropdownMenuSubTrigger>
						<DropdownMenuPortal>
							<DropdownMenuSubContent>
								<MenuEntries entries={entry.children} onPick={onPick} />
							</DropdownMenuSubContent>
						</DropdownMenuPortal>
					</DropdownMenuSub>
				) : (
					<DropdownMenuItem
						key={providerLabelText(entry.label)}
						onSelect={() => onPick(entry.create())}
					>
						{providerLabelText(entry.label)}
					</DropdownMenuItem>
				),
			)}
		</>
	);
}
