import type { TerminalPreset } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { BsTerminalPlus } from "react-icons/bs";
import { HiMiniChevronDown } from "react-icons/hi2";
import { LuPlus } from "react-icons/lu";
import { TbMessageCirclePlus, TbWorld } from "react-icons/tb";
import { HotkeyMenuShortcut } from "renderer/components/HotkeyMenuShortcut";
import { NewTabDropZone } from "../../NewTabDropZone";
import { PresetsSubmenu } from "./components/PresetsSubmenu";

interface AddTabButtonProps {
	hasAiChat: boolean;
	useCompactAddButton: boolean;
	showPresetsBar: boolean;
	presets: TerminalPreset[];
	onDropToNewTab: (paneId: string) => void;
	isLastPaneInTab: (paneId: string) => boolean;
	onAddTerminal: () => void;
	onAddChat: () => void;
	onAddBrowser: () => void;
	onOpenPreset: (preset: TerminalPreset) => void;
	onConfigurePresets: () => void;
	onToggleShowPresetsBar: (enabled: boolean) => void;
	onToggleCompactAddButton: (enabled: boolean) => void;
}

export function AddTabButton({
	hasAiChat,
	useCompactAddButton,
	showPresetsBar,
	presets,
	onDropToNewTab,
	isLastPaneInTab,
	onAddTerminal,
	onAddChat,
	onAddBrowser,
	onOpenPreset,
	onConfigurePresets,
	onToggleShowPresetsBar,
	onToggleCompactAddButton,
}: AddTabButtonProps) {
	const showBigAddButton = !useCompactAddButton;
	const showPresetsInDropdown = !showPresetsBar;

	return (
		<NewTabDropZone onDrop={onDropToNewTab} isLastPaneInTab={isLastPaneInTab}>
			<DropdownMenu>
				<div className="flex items-center shrink-0">
					{showBigAddButton ? (
						<>
							<Button
								variant="outline"
								className="h-7 rounded-r-none pl-2 pr-1.5 gap-1 text-xs"
								onClick={onAddTerminal}
							>
								<BsTerminalPlus className="size-3.5" />
								Terminal
							</Button>
							{hasAiChat && (
								<Button
									variant="outline"
									className="h-7 rounded-none border-l-0 px-1.5 gap-1 text-xs"
									onClick={onAddChat}
								>
									<TbMessageCirclePlus className="size-3.5" />
									Chat
								</Button>
							)}
							<Button
								variant="outline"
								className="h-7 rounded-none border-l-0 px-1.5 gap-1 text-xs"
								onClick={onAddBrowser}
							>
								<TbWorld className="size-3.5" />
								Browser
							</Button>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									className="size-7 rounded-l-none border-l-0 px-1"
								>
									<HiMiniChevronDown className="size-3" />
								</Button>
							</DropdownMenuTrigger>
						</>
					) : (
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-7 px-1 rounded-md border border-border/60 bg-muted/30 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
							>
								<LuPlus className="size-3.5" strokeWidth={1.8} />
							</Button>
						</DropdownMenuTrigger>
					)}
				</div>
				<DropdownMenuContent align="end" className="w-56">
					{!showBigAddButton && (
						<>
							<DropdownMenuItem onClick={onAddTerminal} className="gap-2">
								<BsTerminalPlus className="size-4" />
								<span>Terminal</span>
								<HotkeyMenuShortcut hotkeyId="NEW_GROUP" />
							</DropdownMenuItem>
							{hasAiChat && (
								<DropdownMenuItem onClick={onAddChat} className="gap-2">
									<TbMessageCirclePlus className="size-4" />
									<span>Chat</span>
									<HotkeyMenuShortcut hotkeyId="NEW_CHAT" />
								</DropdownMenuItem>
							)}
							<DropdownMenuItem onClick={onAddBrowser} className="gap-2">
								<TbWorld className="size-4" />
								<span>Browser</span>
								<HotkeyMenuShortcut hotkeyId="NEW_BROWSER" />
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}
					{showPresetsInDropdown && (
						<>
							<PresetsSubmenu
								presets={presets}
								onOpenPreset={onOpenPreset}
								onConfigurePresets={onConfigurePresets}
							/>
							<DropdownMenuSeparator />
						</>
					)}
					<DropdownMenuCheckboxItem
						checked={showPresetsBar}
						onCheckedChange={onToggleShowPresetsBar}
						onSelect={(e) => e.preventDefault()}
					>
						Show Preset Bar
					</DropdownMenuCheckboxItem>
					<DropdownMenuCheckboxItem
						checked={useCompactAddButton}
						onCheckedChange={(checked) =>
							onToggleCompactAddButton(checked === true)
						}
						onSelect={(e) => e.preventDefault()}
					>
						Use Compact Button
					</DropdownMenuCheckboxItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</NewTabDropZone>
	);
}
