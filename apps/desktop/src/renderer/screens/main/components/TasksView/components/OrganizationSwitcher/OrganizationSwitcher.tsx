import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import {
	setActiveOrganizationId,
	useActiveOrganizationIdQuery,
	useOrganizations,
} from "renderer/lib/pglite";
import { trpc } from "renderer/lib/trpc";

export function OrganizationSwitcher() {
	const { data: user } = trpc.user.me.useQuery();
	const orgsResult = useOrganizations(user?.id ?? "");
	const organizations = orgsResult?.rows;
	const { activeOrganizationId } = useActiveOrganizationIdQuery();

	const activeOrganization = organizations?.find(
		(organization) => organization.id === activeOrganizationId,
	);

	const initials = activeOrganization?.name
		?.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-left"
				>
					<Avatar className="h-6 w-6 rounded-md">
						<AvatarImage src={activeOrganization?.avatar_url ?? undefined} />
						<AvatarFallback className="text-xs rounded-md">
							{initials || "?"}
						</AvatarFallback>
					</Avatar>
					<span className="flex-1 text-sm font-medium truncate">
						{activeOrganization?.name || "Select organization"}
					</span>
					<HiChevronUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{organizations?.map((organization) => (
					<DropdownMenuItem
						key={organization.id}
						onSelect={() => {
							console.log("[OrgSwitcher] Switching to:", organization.id);
							setActiveOrganizationId(organization.id);
						}}
						className="gap-2"
					>
						<Avatar className="h-5 w-5 rounded-md">
							<AvatarImage src={organization.avatar_url ?? undefined} />
							<AvatarFallback className="text-xs rounded-md">
								{organization.name?.[0]?.toUpperCase() || "?"}
							</AvatarFallback>
						</Avatar>
						<span className="flex-1 truncate">{organization.name}</span>
						{organization.id === activeOrganizationId && (
							<HiCheck className="h-4 w-4 text-primary" />
						)}
					</DropdownMenuItem>
				))}
				{(!organizations || organizations.length === 0) && (
					<div className="px-2 py-4 text-center text-sm text-muted-foreground">
						No organizations found
					</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
