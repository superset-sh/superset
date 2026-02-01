import { COMPANY } from "@superset/shared/constants";
import { Avatar } from "@superset/ui/atoms/Avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { FaDiscord, FaGithub, FaXTwitter } from "react-icons/fa6";
import { FiUsers } from "react-icons/fi";
import {
	HiCheck,
	HiChevronUpDown,
	HiOutlineArrowRightOnRectangle,
	HiOutlineBookOpen,
	HiOutlineChatBubbleLeftRight,
	HiOutlineCog6Tooth,
	HiOutlineEnvelope,
} from "react-icons/hi2";
import { IoBugOutline } from "react-icons/io5";
import { LuKeyboard } from "react-icons/lu";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useOpenFeedbackModal } from "renderer/stores/feedback-modal";
import { useHotkeyText } from "renderer/stores/hotkeys";

export function OrganizationDropdown() {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const signOutMutation = electronTrpc.auth.signOut.useMutation();
	const navigate = useNavigate();
	const settingsHotkey = useHotkeyText("OPEN_SETTINGS");
	const shortcutsHotkey = useHotkeyText("SHOW_HOTKEYS");
	const openFeedbackModal = useOpenFeedbackModal();

	const activeOrganizationId = session?.session?.activeOrganizationId;

	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const activeOrganization = organizations?.find(
		(o) => o.id === activeOrganizationId,
	);

	const userEmail = session?.user?.email;

	const clearCacheMutation =
		electronTrpc.cache.clearElectricCache.useMutation();

	async function switchOrganization(newOrgId: string): Promise<void> {
		await authClient.organization.setActive({ organizationId: newOrgId });
		clearCacheMutation.mutate();
	}

	async function handleSignOut(): Promise<void> {
		await authClient.signOut();
		signOutMutation.mutate();
	}

	function openExternal(url: string): void {
		window.open(url, "_blank");
	}

	const userName = session?.user?.name;
	const displayName = activeOrganization?.name ?? userName ?? "Organization";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="no-drag flex items-center gap-1.5 h-6 px-1.5 rounded border border-border/60 bg-secondary/50 hover:bg-secondary hover:border-border transition-all duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-ring"
					aria-label="Organization menu"
				>
					<Avatar
						size="xs"
						fullName={activeOrganization?.name}
						image={activeOrganization?.logo}
						className="rounded size-4"
					/>
					<span className="text-xs font-medium truncate max-w-32">
						{displayName}
					</span>
					<HiChevronUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				{/* Organization */}
				<DropdownMenuItem
					onSelect={() => navigate({ to: "/settings/account" })}
				>
					<HiOutlineCog6Tooth className="h-4 w-4" />
					<span>Settings</span>
					{settingsHotkey !== "Unassigned" && (
						<DropdownMenuShortcut>{settingsHotkey}</DropdownMenuShortcut>
					)}
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => navigate({ to: "/settings/organization" })}
				>
					<FiUsers className="h-4 w-4" />
					<span>Manage members</span>
				</DropdownMenuItem>
				{organizations && organizations.length > 1 && (
					<DropdownMenuSub>
						<DropdownMenuSubTrigger className="gap-2">
							<span>Switch organization</span>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							{userEmail && (
								<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
									{userEmail}
								</DropdownMenuLabel>
							)}
							{organizations.map((organization) => (
								<DropdownMenuItem
									key={organization.id}
									onSelect={() => switchOrganization(organization.id)}
									className="gap-2"
								>
									<Avatar
										size="xs"
										fullName={organization.name}
										image={organization.logo}
										className="rounded-md"
									/>
									<span className="flex-1 truncate">{organization.name}</span>
									{organization.id === activeOrganization?.id && (
										<HiCheck className="h-4 w-4 text-primary" />
									)}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				)}

				<DropdownMenuSeparator />

				{/* Help & Support */}
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
				<DropdownMenuItem onClick={openFeedbackModal}>
					<IoBugOutline className="h-4 w-4" />
					Report Issue
				</DropdownMenuItem>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<HiOutlineChatBubbleLeftRight className="h-4 w-4" />
						Contact Us
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent sideOffset={8} className="w-56">
						<DropdownMenuItem onClick={() => openExternal(COMPANY.GITHUB_URL)}>
							<FaGithub className="h-4 w-4" />
							GitHub
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => openExternal(COMPANY.DISCORD_URL)}>
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

				<DropdownMenuSeparator />

				{/* Account */}
				<DropdownMenuItem onSelect={handleSignOut} className="gap-2">
					<HiOutlineArrowRightOnRectangle className="h-4 w-4" />
					<span>Log out</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
