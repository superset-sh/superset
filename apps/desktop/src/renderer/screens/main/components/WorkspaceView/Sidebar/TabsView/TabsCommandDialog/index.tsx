import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import type { TerminalPreset } from "main/lib/db/schemas";
import {
	HiMiniCommandLine,
	HiMiniPlus,
	HiOutlineCog6Tooth,
} from "react-icons/hi2";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";

interface TabsCommandDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAddTab: () => void;
	onOpenPresetsSettings: () => void;
	presets: TerminalPreset[];
	onSelectPreset: (preset: TerminalPreset) => void;
}

export function TabsCommandDialog({
	open,
	onOpenChange,
	onAddTab,
	onOpenPresetsSettings,
	presets,
	onSelectPreset,
}: TabsCommandDialogProps) {
	const isDark = useIsDarkTheme();

	return (
		<CommandDialog open={open} onOpenChange={onOpenChange}>
			<CommandInput placeholder="Type a command or search..." />
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>
				<CommandGroup heading="Terminal">
					<CommandItem onSelect={onAddTab}>
						<HiMiniPlus className="size-4" />
						New Terminal
					</CommandItem>
				</CommandGroup>
				{presets.length > 0 && (
					<CommandGroup heading="Presets">
						{presets.map((preset) => {
							const presetIcon = getPresetIcon(preset.name, isDark);
							return (
								<CommandItem
									key={preset.id}
									onSelect={() => onSelectPreset(preset)}
								>
									{presetIcon ? (
										<img
											src={presetIcon}
											alt=""
											className="size-4 object-contain"
										/>
									) : (
										<HiMiniCommandLine className="size-4" />
									)}
									<span className="flex-1 truncate">
										{preset.name || "default"}
									</span>
									{preset.description ? (
										<span className="text-xs text-muted-foreground truncate max-w-[200px]">
											{preset.description}
										</span>
									) : (
										preset.cwd && (
											<span className="text-xs text-muted-foreground font-mono">
												{preset.cwd}
											</span>
										)
									)}
								</CommandItem>
							);
						})}
					</CommandGroup>
				)}
				<CommandGroup heading="Settings">
					<CommandItem onSelect={onOpenPresetsSettings}>
						<HiOutlineCog6Tooth className="size-4" />
						Configure Presets
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
