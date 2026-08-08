import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { ChevronDown, Rows2, Unlink } from "lucide-react";
import type { GraphRefScope } from "../../types";

/** Scope options, in widening order. Labels are what the strip shows. */
const SCOPE_LABELS: Array<{ value: GraphRefScope; label: string }> = [
	{ value: "head", label: "This workspace" },
	{ value: "open-workspaces", label: "Open workspaces" },
	{ value: "local", label: "All local branches" },
	{ value: "remote", label: "Remote" },
	{ value: "all", label: "Everything" },
];

/** Shown when a persisted scope predates the list above. Matches the `local`
 *  default that both the schema and the router fall back to. */
const FALLBACK_SCOPE_LABEL = "All local branches";

interface GraphHeaderActionsProps {
	refScope: GraphRefScope;
	onSelectRefScope: (scope: GraphRefScope) => void;
	twoLineRefs: boolean;
	onToggleTwoLineRefs: () => void;
	unreferencedOnly: boolean;
	onToggleUnreferencedOnly: () => void;
}

/**
 * The graph's scope chooser plus its two toggles. Presentational — props in,
 * controls out; the persisted fields and write paths live in useGraphTab.
 *
 * These live on the graph's own control strip, not in SidebarHeader's `actions`
 * slot: that slot is a shrink-0 island in a 40px row whose four tab buttons are
 * each flex-1 with no min-w-0, so anything rendered there clips the last tab
 * label ("Review") instead of shrinking it.
 *
 * Icon-only, sized to sit beside the strip's 10px text rather than to match a
 * tab button.
 */
export function GraphHeaderActions({
	refScope,
	onSelectRefScope,
	twoLineRefs,
	onToggleTwoLineRefs,
	unreferencedOnly,
	onToggleUnreferencedOnly,
}: GraphHeaderActionsProps) {
	const scopeLabel =
		SCOPE_LABELS.find((s) => s.value === refScope)?.label ??
		FALLBACK_SCOPE_LABEL;
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						aria-label={`Graph scope: ${scopeLabel}`}
					>
						{scopeLabel}
						<ChevronDown className="size-2.5" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuRadioGroup
						value={refScope}
						onValueChange={(value) => onSelectRefScope(value as GraphRefScope)}
					>
						{SCOPE_LABELS.map((scope) => (
							<DropdownMenuRadioItem key={scope.value} value={scope.value}>
								{scope.label}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onToggleTwoLineRefs}
						className={cn(
							"rounded p-0.5 transition-colors hover:bg-accent",
							twoLineRefs
								? "text-foreground"
								: "text-muted-foreground/60 hover:text-muted-foreground",
						)}
						aria-pressed={twoLineRefs}
						aria-label={
							twoLineRefs
								? "Show ref badges inline"
								: "Show ref badges on their own line"
						}
					>
						<Rows2 className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{twoLineRefs ? "Inline refs" : "Two-line refs"}
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onToggleUnreferencedOnly}
						className={cn(
							"rounded p-0.5 transition-colors hover:bg-accent",
							unreferencedOnly
								? "text-foreground"
								: "text-muted-foreground/60 hover:text-muted-foreground",
						)}
						aria-pressed={unreferencedOnly}
						aria-label={
							unreferencedOnly
								? "Stop highlighting unreferenced refs"
								: "Highlight unreferenced refs"
						}
					>
						<Unlink className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{unreferencedOnly ? "Stop highlighting" : "Highlight unreferenced"}
				</TooltipContent>
			</Tooltip>
		</>
	);
}
