import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { HiMiniCommandLine } from "react-icons/hi2";
import { formatKeysForDisplay, HOTKEYS } from "shared/hotkeys";

const shortcuts = [HOTKEYS.NEW_TERMINAL, HOTKEYS.SPLIT_HORIZONTAL];

export function EmptyTabView() {
	return (
		<div className="flex-1 h-full flex flex-col items-center justify-center gap-6">
			<div className="p-4 rounded-lg bg-muted border border-border">
				<HiMiniCommandLine className="size-8 text-muted-foreground" />
			</div>

			<p className="text-sm text-muted-foreground">No terminal open</p>

			<div className="flex items-center gap-4 text-xs text-muted-foreground">
				{shortcuts.map((shortcut) => (
					<div key={shortcut.label} className="flex items-center gap-2">
						<KbdGroup>
							{formatKeysForDisplay(shortcut.keys).map((key) => (
								<Kbd key={key}>{key}</Kbd>
							))}
						</KbdGroup>
						<span>{shortcut.label}</span>
					</div>
				))}
			</div>
		</div>
	);
}
