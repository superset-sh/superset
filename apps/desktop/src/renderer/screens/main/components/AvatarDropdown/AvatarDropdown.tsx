import { COMPANY, FEATURE_FLAGS } from "@superset/shared/constants";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { toast } from "@superset/ui/sonner";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { FaDiscord, FaXTwitter } from "react-icons/fa6";
import {
	HiOutlineArrowRightOnRectangle,
	HiOutlineBugAnt,
	HiOutlineClipboardDocumentList,
	HiOutlineCog6Tooth,
	HiOutlineCommandLine,
	HiOutlineEnvelope,
} from "react-icons/hi2";
import { LuLifeBuoy } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useOpenSettings, useOpenTasks } from "renderer/stores";
import { HOTKEYS } from "shared/hotkeys";

export function AvatarDropdown() {
	const { data: user } = trpc.user.me.useQuery();
	const openSettings = useOpenSettings();
	const openTasks = useOpenTasks();
	const hasTasksAccess = useFeatureFlagEnabled(
		FEATURE_FLAGS.ELECTRIC_TASKS_ACCESS,
	);
	const signOutMutation = trpc.auth.signOut.useMutation({
		onSuccess: () => toast.success("Signed out"),
	});

	const initials = user?.name
		?.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	const handleSettings = () => {
		openSettings();
	};

	const handleTasks = () => {
		openTasks();
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

	const handleViewHotkeys = () => {
		openSettings("keyboard");
	};

	const handleSignOut = () => {
		signOutMutation.mutate();
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="no-drag rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
					aria-label="User menu"
				>
					<Avatar className="h-7 w-7 cursor-pointer hover:opacity-80 transition-opacity border border-border">
						<AvatarImage src={user?.avatarUrl ?? undefined} />
						<AvatarFallback className="text-xs">
							{initials || "?"}
						</AvatarFallback>
					</Avatar>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				{user && (
					<>
						<div className="px-2 py-1.5">
							<p className="text-sm font-medium">{user.name}</p>
							<p className="text-xs text-muted-foreground">{user.email}</p>
						</div>
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuItem onClick={handleSettings}>
					<HiOutlineCog6Tooth className="h-4 w-4" />
					Settings
				</DropdownMenuItem>
				{hasTasksAccess && (
					<DropdownMenuItem onClick={handleTasks}>
						<HiOutlineClipboardDocumentList className="h-4 w-4" />
						Tasks
					</DropdownMenuItem>
				)}
				<DropdownMenuItem onClick={handleViewHotkeys}>
					<HiOutlineCommandLine className="h-4 w-4" />
					<span className="flex-1">Hotkeys</span>
					<KbdGroup>
						{HOTKEYS.SHOW_HOTKEYS.display.map((key) => (
							<Kbd key={key}>{key}</Kbd>
						))}
					</KbdGroup>
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
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleReportIssue}>
					<HiOutlineBugAnt className="h-4 w-4" />
					Report Issue
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleSignOut}>
					<HiOutlineArrowRightOnRectangle className="h-4 w-4" />
					Sign Out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
