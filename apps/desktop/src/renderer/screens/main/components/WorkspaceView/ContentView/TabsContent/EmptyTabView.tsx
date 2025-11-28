import { HiMiniCommandLine, HiMiniPlus, HiMiniSquares2X2 } from "react-icons/hi2";

const shortcuts = [
	{ keys: ["⌘", "T"], label: "New terminal", icon: HiMiniPlus },
	{ keys: ["⌘", "D"], label: "Split view", icon: HiMiniSquares2X2 },
];

export function EmptyTabView() {
	return (
		<div className="flex-1 h-full flex flex-col items-center justify-center gap-6">
			<div className="p-4 rounded-lg bg-muted border border-border">
				<HiMiniCommandLine className="size-8 text-muted-foreground" />
			</div>

			<div className="flex flex-col items-center gap-1">
				<p className="text-sm text-muted-foreground">No terminal open</p>
			</div>

			<div className="flex items-center gap-4 text-xs text-muted-foreground">
				{shortcuts.map((shortcut) => (
					<div key={shortcut.label} className="flex items-center gap-2">
						<shortcut.icon className="size-3.5" />
						<div className="flex items-center gap-1">
							{shortcut.keys.map((key) => (
								<kbd
									key={key}
									className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]"
								>
									{key}
								</kbd>
							))}
						</div>
						<span>{shortcut.label}</span>
					</div>
				))}
			</div>
		</div>
	);
}
