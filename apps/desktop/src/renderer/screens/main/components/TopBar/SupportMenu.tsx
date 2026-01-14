import { COMPANY } from "@superset/shared/constants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { FaDiscord, FaXTwitter } from "react-icons/fa6";
import {
	HiOutlineBugAnt,
	HiOutlineEnvelope,
	HiOutlineQuestionMarkCircle,
} from "react-icons/hi2";
import { LuKeyboard, LuLifeBuoy } from "react-icons/lu";
import { useHotkeyText } from "renderer/stores/hotkeys";

export function SupportMenu() {
	const navigate = useNavigate();
	const shortcutsHotkey = useHotkeyText("SHOW_HOTKEYS");
	const showShortcut = shortcutsHotkey !== "Unassigned";

	const handleKeyboardShortcuts = () => {
		navigate({ to: "/settings/keyboard" });
	};

	const handleContactUs = () => {
		window.open(COMPANY.MAIL_TO, "_blank");
	};

	const handleReportIssue = () => {
		window.open(COMPANY.REPORT_ISSUE_URL, "_blank");
	};

	const handleJoinDiscord = () => {
		window.open(COMPANY.DISCORD_URL, "_blank");
	};

	const handleTwitter = () => {
		window.open(COMPANY.X_URL, "_blank");
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="no-drag rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
					aria-label="Help and support"
				>
					<HiOutlineQuestionMarkCircle className="h-5 w-5" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuItem onClick={handleReportIssue}>
					<HiOutlineBugAnt className="h-4 w-4" />
					Report Issue
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleKeyboardShortcuts}>
					<LuKeyboard className="h-4 w-4" />
					Keyboard Shortcuts
					{showShortcut && (
						<DropdownMenuShortcut>{shortcutsHotkey}</DropdownMenuShortcut>
					)}
				</DropdownMenuItem>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<LuLifeBuoy className="h-4 w-4" />
						Contact Us
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent sideOffset={8} className="w-56">
						<DropdownMenuItem onClick={handleJoinDiscord}>
							<FaDiscord className="h-4 w-4" />
							Discord
						</DropdownMenuItem>

						<DropdownMenuItem onClick={handleTwitter}>
							<FaXTwitter className="h-4 w-4" />X
						</DropdownMenuItem>

						<DropdownMenuItem onClick={handleContactUs}>
							<HiOutlineEnvelope className="h-4 w-4" />
							Email Founders
						</DropdownMenuItem>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
