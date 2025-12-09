import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { HiMiniPlus, HiOutlineCog6Tooth } from "react-icons/hi2";

interface TabsCommandDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAddTab: () => void;
	onOpenPresetsSettings: () => void;
}

export function TabsCommandDialog({
	open,
	onOpenChange,
	onAddTab,
	onOpenPresetsSettings,
}: TabsCommandDialogProps) {
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
				<CommandGroup heading="Presets">
					<CommandItem onSelect={onOpenPresetsSettings}>
						<HiOutlineCog6Tooth className="size-4" />
						Configure Presets
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
