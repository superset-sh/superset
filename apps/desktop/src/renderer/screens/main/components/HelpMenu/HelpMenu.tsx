import { COMPANY } from "@superset/shared/constants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { FaDiscord } from "react-icons/fa";
import {
	HiOutlineBugAnt,
	HiOutlineCommandLine,
	HiOutlineEnvelope,
} from "react-icons/hi2";
import { LuLifeBuoy } from "react-icons/lu";
import { useOpenSettings } from "renderer/stores";
import { HOTKEYS } from "shared/hotkeys";

export function HelpMenu() {
	const openSettings = useOpenSettings();

	const handleContactUs = () => {
		window.open(COMPANY.CONTACT_URL, "_blank");
	};

	const handleReportIssue = () => {
		window.open(COMPANY.REPORT_ISSUE_URL, "_blank");
	};

	const handleJoinDiscord = () => {
		window.open(COMPANY.DISCORD_URL, "_blank");
	};

	const handleViewHotkeys = () => {
		openSettings("keyboard");
	};

	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="flex items-center gap-1.5 h-[22px] px-2 rounded border border-foreground/15 bg-foreground/[0.03] hover:bg-foreground/[0.08] hover:border-foreground/25 text-foreground/70 hover:text-foreground/90 transition-all text-[11px] font-medium"
							aria-label="Help menu"
						>
							<LuLifeBuoy className="size-3.5" />
							<span>Help</span>
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="top" sideOffset={8}>
					Get help & support
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="start" side="top" className="w-64">
				<DropdownMenuItem onClick={handleContactUs}>
					<HiOutlineEnvelope className="h-4 w-4" />
					Contact Us
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleReportIssue}>
					<HiOutlineBugAnt className="h-4 w-4" />
					Report Issue
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleJoinDiscord}>
					<FaDiscord className="h-4 w-4" />
					Join Discord
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleViewHotkeys}>
					<HiOutlineCommandLine className="h-4 w-4" />
					<span className="flex-1">Keyboard Shortcuts</span>
					<KbdGroup>
						{HOTKEYS.SHOW_HOTKEYS.display.map((key) => (
							<Kbd key={key}>{key}</Kbd>
						))}
					</KbdGroup>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
