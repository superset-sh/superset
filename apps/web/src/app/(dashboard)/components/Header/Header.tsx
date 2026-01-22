"use client";

import { authClient } from "@superset/auth/client";
import { getInitials } from "@superset/shared/names";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useTRPC } from "@/trpc/react";

export function Header() {
	const { data: session } = authClient.useSession();
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const { data: organizations } = useQuery(
		trpc.user.myOrganizations.queryOptions(),
	);

	const user = session?.user;
	const initials = getInitials(user?.name, user?.email);
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const activeOrganization = organizations?.find(
		(org) => org.id === activeOrganizationId,
	);

	const handleSignOut = async () => {
		await authClient.signOut();
		router.push("/sign-in");
	};

	const handleSwitchOrganization = async (organizationId: string) => {
		await authClient.organization.setActive({ organizationId });
		queryClient.invalidateQueries();
		router.refresh();
	};

	return (
		<header className="sticky left-0 top-0 z-40 w-full border-b border-border/50 bg-background py-4">
			<div className="mx-auto flex min-h-8 w-[95vw] max-w-screen-2xl items-center justify-between">
				<Link href="/" aria-label="Go to home">
					<Image
						src="/title.svg"
						alt="Superset"
						width={150}
						height={25}
						priority
					/>
				</Link>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<Avatar className="size-8">
								<AvatarImage
									src={user?.image ?? undefined}
									alt={user?.name ?? ""}
								/>
								<AvatarFallback className="text-xs">{initials}</AvatarFallback>
							</Avatar>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-56">
						<DropdownMenuLabel>
							<div className="flex flex-col space-y-1">
								<p className="text-sm font-medium">{user?.name}</p>
								<p className="text-xs text-muted-foreground">{user?.email}</p>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						{organizations && organizations.length === 1 && (
							<>
								<div className="flex items-center px-2 py-1.5 text-sm">
									<Avatar className="mr-2 size-4">
										<AvatarFallback className="text-[8px]">
											{activeOrganization?.name?.charAt(0) ?? "O"}
										</AvatarFallback>
									</Avatar>
									<span className="truncate">
										{activeOrganization?.name ?? "Organization"}
									</span>
								</div>
								<DropdownMenuSeparator />
							</>
						)}
						{organizations && organizations.length > 1 && (
							<>
								<DropdownMenuSub>
									<DropdownMenuSubTrigger className="cursor-pointer">
										<Avatar className="mr-2 size-4">
											<AvatarFallback className="text-[8px]">
												{activeOrganization?.name?.charAt(0) ?? "O"}
											</AvatarFallback>
										</Avatar>
										<span className="truncate">
											{activeOrganization?.name ?? "Organization"}
										</span>
									</DropdownMenuSubTrigger>
									<DropdownMenuSubContent>
										<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
											Switch organization
										</DropdownMenuLabel>
										{organizations.map((org) => (
											<DropdownMenuItem
												key={org.id}
												className="cursor-pointer"
												onClick={() => handleSwitchOrganization(org.id)}
											>
												<Avatar className="mr-2 size-4">
													<AvatarFallback className="text-[8px]">
														{org.name?.charAt(0) ?? "O"}
													</AvatarFallback>
												</Avatar>
												<span className="flex-1 truncate">{org.name}</span>
												{org.id === activeOrganizationId && (
													<Check className="ml-2 size-4 text-primary" />
												)}
											</DropdownMenuItem>
										))}
									</DropdownMenuSubContent>
								</DropdownMenuSub>
								<DropdownMenuSeparator />
							</>
						)}
						<DropdownMenuItem
							className="cursor-pointer"
							onClick={handleSignOut}
						>
							<LogOut className="mr-2 size-4" />
							Logout
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	);
}
