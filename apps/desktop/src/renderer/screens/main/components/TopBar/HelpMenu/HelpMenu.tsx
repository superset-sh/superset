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
	HiOutlineQuestionMarkCircle,
} from "react-icons/hi2";
import { useOpenSettings } from "renderer/stores";
import { HELP_MENU } from "shared/constants";
import { formatKeysForDisplay, HOTKEYS } from "shared/hotkeys";

export function HelpMenu() {
	const openSettings = useOpenSettings();
	const hotkeyKeys = formatKeysForDisplay(HOTKEYS.SHOW_HOTKEYS.keys);

	const handleContactUs = () => {
		window.open(HELP_MENU.CONTACT_URL, "_blank");
	};

	const handleReportIssue = () => {
		window.open(HELP_MENU.REPORT_ISSUE_URL, "_blank");
	};

	const handleJoinDiscord = () => {
		window.open(HELP_MENU.DISCORD_URL, "_blank");
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
							className="no-drag flex h-8 w-8 items-center justify-center rounded-md text-accent-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
							aria-label="Help menu"
						>
							<HiOutlineQuestionMarkCircle className="h-4 w-4" />
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Help
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="end" side="bottom" className="w-64">
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
						{hotkeyKeys.map((key) => (
							<Kbd key={key}>{key}</Kbd>
						))}
					</KbdGroup>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
