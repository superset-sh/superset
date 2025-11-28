import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import {
	formatKeysForDisplay,
	getHotkeysByCategory,
	type HotkeyCategory,
	type HotkeyDefinition,
} from "shared/hotkeys";

interface HotkeyModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const CATEGORY_ORDER: HotkeyCategory[] = [
	"Workspace",
	"Terminal",
	"Layout",
	"Window",
	"Help",
];

function HotkeyRow({ hotkey }: { hotkey: HotkeyDefinition }) {
	const keys = formatKeysForDisplay(hotkey.keys);

	return (
		<div className="flex items-center justify-between py-1.5">
			<span className="text-sm text-foreground">{hotkey.label}</span>
			<KbdGroup>
				{keys.map((key) => (
					<Kbd key={key}>{key}</Kbd>
				))}
			</KbdGroup>
		</div>
	);
}

function HotkeySection({
	category,
	hotkeys,
}: {
	category: HotkeyCategory;
	hotkeys: HotkeyDefinition[];
}) {
	if (hotkeys.length === 0) return null;

	// Consolidate workspace jump shortcuts for cleaner display
	const consolidatedHotkeys = consolidateWorkspaceJumps(hotkeys);

	return (
		<div className="space-y-1">
			<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
				{category}
			</h3>
			{consolidatedHotkeys.map((hotkey) => (
				<HotkeyRow key={hotkey.keys} hotkey={hotkey} />
			))}
		</div>
	);
}

/**
 * Consolidate individual workspace jump shortcuts (1-9) into a single entry
 */
function consolidateWorkspaceJumps(
	hotkeys: HotkeyDefinition[],
): HotkeyDefinition[] {
	const workspaceJumpPattern = /^Switch to Workspace \d$/;
	const hasWorkspaceJumps = hotkeys.some((h) =>
		workspaceJumpPattern.test(h.label),
	);

	if (!hasWorkspaceJumps) return hotkeys;

	const filtered = hotkeys.filter((h) => !workspaceJumpPattern.test(h.label));
	filtered.unshift({
		keys: "meta+1-9",
		label: "Switch to Workspace 1-9",
		category: "Workspace",
	});

	return filtered;
}

export function HotkeyModal({ open, onOpenChange }: HotkeyModalProps) {
	const hotkeysByCategory = getHotkeysByCategory();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Keyboard Shortcuts</DialogTitle>
				</DialogHeader>
				<div className="grid gap-6 py-4">
					{CATEGORY_ORDER.map((category) => (
						<HotkeySection
							key={category}
							category={category}
							hotkeys={hotkeysByCategory[category]}
						/>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
