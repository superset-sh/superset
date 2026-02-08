import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { HiMiniCommandLine } from "react-icons/hi2";
import { useHotkeyDisplay } from "renderer/stores/hotkeys";

export function EmptyTabView() {
	const newGroupDisplay = useHotkeyDisplay("NEW_GROUP");
	const openInAppDisplay = useHotkeyDisplay("OPEN_IN_APP");

	const shortcuts = [
		{ label: "New Terminal", display: newGroupDisplay },
		{ label: "Open in App", display: openInAppDisplay },
	];

	return (
		<div className="flex-1 flex flex-col items-center justify-center gap-6 h-full">
			<div className="p-4 rounded-lg bg-muted border border-border">
				<HiMiniCommandLine className="size-8 text-muted-foreground" />
			</div>

			<p className="text-sm text-muted-foreground">No terminal open</p>

			<div className="flex items-center gap-4 text-xs text-muted-foreground">
				{shortcuts.map((shortcut) => (
					<div key={shortcut.label} className="flex items-center gap-2">
						<KbdGroup>
							{shortcut.display.map((key) => (
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
