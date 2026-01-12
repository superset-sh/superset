import { getInitials } from "@superset/shared/names";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useLiveQuery } from "@tanstack/react-db";
import { FaDiscord, FaXTwitter } from "react-icons/fa6";
import {
	HiCheck,
	HiChevronUpDown,
	HiOutlineArrowRightOnRectangle,
	HiOutlineCog6Tooth,
	HiOutlineCommandLine,
	HiOutlineEnvelope,
	HiOutlineUserGroup,
} from "react-icons/hi2";
import { useAuth } from "renderer/contexts/AuthProvider";
import { useCollections } from "renderer/contexts/CollectionsProvider";
import { trpc } from "renderer/lib/trpc";
import { useOpenSettings } from "renderer/stores/app-state";
import { useHotkeyText } from "renderer/stores/hotkeys/store";

interface OrganizationDropdownProps {
	isCollapsed?: boolean;
}

export function OrganizationDropdown({
	isCollapsed = false,
}: OrganizationDropdownProps) {
	const { session } = useAuth();
	const collections = useCollections();
	const setActiveOrg = trpc.auth.setActiveOrganization.useMutation();
	const signOut = trpc.auth.signOut.useMutation();
	const openUrl = trpc.external.openUrl.useMutation();
	const openSettings = useOpenSettings();
	const hotkeysShortcut = useHotkeyText("SHOW_HOTKEYS");

	const activeOrganizationId = session?.session?.activeOrganizationId;

	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const activeOrganization = organizations?.find(
		(o) => o.id === activeOrganizationId,
	);

	// Always render dropdown to prevent trapping users without orgs
	const orgName = activeOrganization?.name ?? "No Organization";
	const initials = getInitials(activeOrganization?.name);

	const switchOrganization = async (newOrgId: string) => {
		await setActiveOrg.mutateAsync({ organizationId: newOrgId });
	};

	const handleSignOut = () => {
		signOut.mutate();
	};

	const trigger = isCollapsed ? (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					className="flex items-center justify-center size-8 rounded-md hover:bg-accent/50 transition-colors"
				>
					<Avatar className="h-6 w-6 rounded-md">
						<AvatarImage src={activeOrganization?.logo ?? undefined} />
						<AvatarFallback className="text-xs rounded-md">
							{initials || "?"}
						</AvatarFallback>
					</Avatar>
				</button>
			</TooltipTrigger>
			<TooltipContent side="right">{orgName}</TooltipContent>
		</Tooltip>
	) : (
		<button
			type="button"
			className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-left"
		>
			<Avatar className="h-6 w-6 rounded-md">
				<AvatarImage src={activeOrganization?.logo ?? undefined} />
				<AvatarFallback className="text-xs rounded-md">
					{initials || "?"}
				</AvatarFallback>
			</Avatar>
			<span className="flex-1 text-sm font-medium truncate">{orgName}</span>
			<HiChevronUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
		</button>
	);

	const userEmail = session?.user?.email;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{/* Only show org-specific items if user has an active organization */}
				{activeOrganization && (
					<>
						{/* Settings */}
						<DropdownMenuItem onSelect={() => openSettings()} className="gap-2">
							<HiOutlineCog6Tooth className="h-4 w-4" />
							<span>Settings</span>
						</DropdownMenuItem>

						{/* Team management */}
						<DropdownMenuItem
							onSelect={() => openSettings("team")}
							className="gap-2"
						>
							<HiOutlineUserGroup className="h-4 w-4" />
							<span>Team</span>
						</DropdownMenuItem>

						{/* Hotkeys */}
						<DropdownMenuItem
							onSelect={() => openSettings("keyboard")}
							className="gap-2"
						>
							<HiOutlineCommandLine className="h-4 w-4" />
							<span className="flex-1">Hotkeys</span>
							{hotkeysShortcut !== "Unassigned" && (
								<DropdownMenuShortcut>{hotkeysShortcut}</DropdownMenuShortcut>
							)}
						</DropdownMenuItem>

						<DropdownMenuSeparator />
					</>
				)}

				{/* Org switcher - only show if user has multiple orgs */}
				{organizations && organizations.length > 1 && (
					<>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger className="gap-2">
								<span>Switch organization</span>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								{/* User email header in submenu */}
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
										<Avatar className="h-5 w-5 rounded-md">
											<AvatarImage src={organization.logo ?? undefined} />
											<AvatarFallback className="text-xs rounded-md">
												{organization.name?.[0]?.toUpperCase() || "?"}
											</AvatarFallback>
										</Avatar>
										<span className="flex-1 truncate">{organization.name}</span>
										{organization.id === activeOrganization?.id && (
											<HiCheck className="h-4 w-4 text-primary" />
										)}
									</DropdownMenuItem>
								))}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuSeparator />
					</>
				)}

				{/* Contact Us */}
				<DropdownMenuSub>
					<DropdownMenuSubTrigger className="gap-2">
						<HiOutlineEnvelope className="h-4 w-4" />
						<span>Contact us</span>
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						<DropdownMenuItem
							onSelect={() => openUrl.mutate("https://discord.gg/superset")}
							className="gap-2"
						>
							<FaDiscord className="h-4 w-4" />
							<span>Discord</span>
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => openUrl.mutate("mailto:founders@superset.sh")}
							className="gap-2"
						>
							<HiOutlineEnvelope className="h-4 w-4" />
							<span>Email founders</span>
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => openUrl.mutate("https://x.com/supersetsh")}
							className="gap-2"
						>
							<FaXTwitter className="h-4 w-4" />
							<span>X (Twitter)</span>
						</DropdownMenuItem>
					</DropdownMenuSubContent>
				</DropdownMenuSub>

				<DropdownMenuSeparator />

				{/* Sign out - ALWAYS show so users can never get trapped */}
				<DropdownMenuItem onSelect={handleSignOut} className="gap-2">
					<HiOutlineArrowRightOnRectangle className="h-4 w-4" />
					<span>Log out</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
