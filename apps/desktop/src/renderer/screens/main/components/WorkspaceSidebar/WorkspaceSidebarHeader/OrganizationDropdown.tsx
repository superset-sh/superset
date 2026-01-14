import { Avatar } from "@superset/ui/atoms/Avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import {
	HiCheck,
	HiChevronUpDown,
	HiOutlineArrowRightOnRectangle,
} from "react-icons/hi2";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface OrganizationDropdownProps {
	isCollapsed?: boolean;
}

export function OrganizationDropdown({
	isCollapsed = false,
}: OrganizationDropdownProps) {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const signOutMutation = electronTrpc.auth.signOut.useMutation();
	const navigate = useNavigate();

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

	const switchOrganization = async (newOrgId: string) => {
		await authClient.organization.setActive({
			organizationId: newOrgId,
		});
	};

	const handleSignOut = async () => {
		await authClient.signOut();
		signOutMutation.mutate();
	};

	const trigger = isCollapsed ? (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					className="flex items-center justify-center size-8 rounded-md hover:bg-accent/50 transition-colors"
				>
					<Avatar
						size="sm"
						fullName={activeOrganization?.name}
						image={activeOrganization?.logo}
						className="rounded-md"
					/>
				</button>
			</TooltipTrigger>
			<TooltipContent side="right">{orgName}</TooltipContent>
		</Tooltip>
	) : (
		<button
			type="button"
			className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-left"
		>
			<Avatar
				size="sm"
				fullName={activeOrganization?.name}
				image={activeOrganization?.logo}
				className="rounded-md"
			/>
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
						<DropdownMenuItem
							onSelect={() => navigate({ to: "/settings/account" })}
						>
							<span>Settings</span>
						</DropdownMenuItem>

						{/* Team management */}
						<DropdownMenuItem
							onSelect={() => navigate({ to: "/settings/team" })}
						>
							<span>Invite and manage members</span>
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
						<DropdownMenuSeparator />
					</>
				)}

				{/* Sign out - ALWAYS show so users can never get trapped */}
				<DropdownMenuItem onSelect={handleSignOut} className="gap-2">
					<HiOutlineArrowRightOnRectangle className="h-4 w-4" />
					<span>Log out</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
