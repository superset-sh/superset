import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { HiMiniCommandLine } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useHotkeyDisplay } from "renderer/stores/hotkeys";
import { DEFAULT_NAVIGATION_STYLE } from "shared/constants";
import { SidebarControl } from "../../../SidebarControl";

export function EmptyTabView() {
	const newTerminalDisplay = useHotkeyDisplay("NEW_TERMINAL");
	const openInAppDisplay = useHotkeyDisplay("OPEN_IN_APP");

	// Get navigation style to conditionally show sidebar toggle
	const { data: navigationStyle } = trpc.settings.getNavigationStyle.useQuery();
	const isSidebarMode =
		(navigationStyle ?? DEFAULT_NAVIGATION_STYLE) === "sidebar";

	const shortcuts = [
		{ label: "New Terminal", display: newTerminalDisplay },
		{ label: "Open in App", display: openInAppDisplay },
	];

	return (
		<div className="h-full flex flex-col overflow-hidden">
			{isSidebarMode && (
				<div className="flex items-center h-10 pl-2 bg-background shrink-0">
					<SidebarControl />
				</div>
			)}
			<div className="flex-1 flex flex-col items-center justify-center gap-6">
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
		</div>
	);
}
