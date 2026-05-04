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
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FaDiscord, FaGithub, FaXTwitter } from "react-icons/fa6";
import {
	HiOutlineBookOpen,
	HiOutlineChatBubbleLeftRight,
	HiOutlineEnvelope,
	HiOutlineQuestionMarkCircle,
} from "react-icons/hi2";
import { IoBugOutline } from "react-icons/io5";
import { LuKeyboard, LuMegaphone } from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { SubmitPromptDialog } from "./components/SubmitPromptDialog";

interface DashboardSidebarHelpMenuProps {
	isCollapsed: boolean;
}

export function DashboardSidebarHelpMenu({
	isCollapsed,
}: DashboardSidebarHelpMenuProps) {
	const navigate = useNavigate();
	const shortcutsHotkey = useHotkeyDisplay("SHOW_HOTKEYS").text;
	const [submitPromptOpen, setSubmitPromptOpen] = useState(false);

	const openExternal = (url: string) => {
		window.open(url, "_blank");
	};

	const triggerButton = (
		<button
			type="button"
			aria-label="Help"
			className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
		>
			<HiOutlineQuestionMarkCircle className="size-4" />
		</button>
	);

	return (
		<>
			<DropdownMenu>
				{isCollapsed ? (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent side="right">Help</TooltipContent>
					</Tooltip>
				) : (
					<DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
				)}
				<DropdownMenuContent
					align={isCollapsed ? "start" : "end"}
					side="top"
					className="w-56"
				>
					<DropdownMenuItem onSelect={() => setSubmitPromptOpen(true)}>
						<LuMegaphone className="h-4 w-4" />
						Submit a prompt
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => openExternal(COMPANY.DOCS_URL)}>
						<HiOutlineBookOpen className="h-4 w-4" />
						Documentation
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => navigate({ to: "/settings/keyboard" })}
					>
						<LuKeyboard className="h-4 w-4" />
						Keyboard Shortcuts
						{shortcutsHotkey !== "Unassigned" && (
							<DropdownMenuShortcut>{shortcutsHotkey}</DropdownMenuShortcut>
						)}
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => openExternal(COMPANY.REPORT_ISSUE_URL)}
					>
						<IoBugOutline className="h-4 w-4" />
						Report Issue
					</DropdownMenuItem>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<HiOutlineChatBubbleLeftRight className="h-4 w-4" />
							Contact Us
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent sideOffset={8} className="w-56">
							<DropdownMenuItem
								onClick={() => openExternal(COMPANY.GITHUB_URL)}
							>
								<FaGithub className="h-4 w-4" />
								GitHub
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => openExternal(COMPANY.DISCORD_URL)}
							>
								<FaDiscord className="h-4 w-4" />
								Discord
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => openExternal(COMPANY.X_URL)}>
								<FaXTwitter className="h-4 w-4" />X
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => openExternal(COMPANY.MAIL_TO)}>
								<HiOutlineEnvelope className="h-4 w-4" />
								Email Founders
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				</DropdownMenuContent>
			</DropdownMenu>
			<SubmitPromptDialog
				open={submitPromptOpen}
				onOpenChange={setSubmitPromptOpen}
			/>
		</>
	);
}
