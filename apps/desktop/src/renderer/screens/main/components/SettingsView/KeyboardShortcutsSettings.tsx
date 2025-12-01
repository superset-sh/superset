import { Input } from "@superset/ui/input";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { useMemo, useState } from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";
import {
	formatKeysForDisplay,
	getHotkeysByCategory,
	type HotkeyCategory,
	type HotkeyDefinition,
} from "shared/hotkeys";

function useIsMac(): boolean {
	return useMemo(() => {
		const platform = navigator.platform?.toUpperCase() ?? "";
		const userAgent = navigator.userAgent?.toUpperCase() ?? "";
		return platform.includes("MAC") || userAgent.includes("MAC");
	}, []);
}

const CATEGORY_ORDER: HotkeyCategory[] = [
	"Workspace",
	"Terminal",
	"Layout",
	"Window",
	"Help",
];

function HotkeyRow({
	hotkey,
	isEven,
}: {
	hotkey: HotkeyDefinition;
	isEven: boolean;
}) {
	const keys = formatKeysForDisplay(hotkey.keys);

	return (
		<div
			className={`flex items-center justify-between py-3 px-4 ${
				isEven ? "bg-accent/20" : ""
			}`}
		>
			<span className="text-sm text-foreground">{hotkey.label}</span>
			<KbdGroup>
				{keys.map((key) => (
					<Kbd key={key}>{key}</Kbd>
				))}
			</KbdGroup>
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

export function KeyboardShortcutsSettings() {
	const [searchQuery, setSearchQuery] = useState("");
	const hotkeysByCategory = getHotkeysByCategory();
	const isMac = useIsMac();
	const modifierKey = isMac ? "⌘" : "Ctrl";

	// Flatten and consolidate all hotkeys
	const allHotkeys = CATEGORY_ORDER.flatMap((category) =>
		consolidateWorkspaceJumps(hotkeysByCategory[category]),
	);

	// Filter based on search query
	const filteredHotkeys = searchQuery
		? allHotkeys.filter((hotkey) =>
				hotkey.label.toLowerCase().includes(searchQuery.toLowerCase()),
			)
		: allHotkeys;

	return (
		<div className="p-6 w-full max-w-3xl">
			{/* Header */}
			<div className="mb-6">
				<h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
				<p className="text-sm text-muted-foreground mt-1">
					View all available keyboard shortcuts. Press{" "}
					<Kbd className="mx-1">{modifierKey}</Kbd>
					<Kbd>?</Kbd> to open this page anytime.
				</p>
			</div>

			{/* Search */}
			<div className="relative mb-6">
				<HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					type="text"
					placeholder="Search"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className="pl-9 bg-accent/30 border-transparent focus:border-accent"
				/>
			</div>

			{/* Table */}
			<div className="rounded-lg border border-border overflow-hidden">
				{/* Table Header */}
				<div className="flex items-center justify-between py-2 px-4 bg-accent/10 border-b border-border">
					<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
						Command
					</span>
					<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
						Shortcut
					</span>
				</div>

				{/* Table Body */}
				<div className="max-h-[calc(100vh-320px)] overflow-y-auto">
					{filteredHotkeys.length > 0 ? (
						filteredHotkeys.map((hotkey, index) => (
							<HotkeyRow
								key={hotkey.keys}
								hotkey={hotkey}
								isEven={index % 2 === 0}
							/>
						))
					) : (
						<div className="py-8 text-center text-sm text-muted-foreground">
							No shortcuts found matching "{searchQuery}"
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
