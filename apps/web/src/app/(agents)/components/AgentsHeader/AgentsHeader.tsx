"use client";

import { authClient } from "@superset/auth/client";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Drawer, DrawerContent, DrawerTitle } from "@superset/ui/drawer";
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
import { useIsMobile } from "@superset/ui/hooks/use-mobile";
import { toast } from "@superset/ui/sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useTRPC } from "@/trpc/react";

const navItems = [
	{ label: "Agents", href: "/agents" },
	{ label: "Integrations", href: "/integrations" },
];

export function AgentsHeader() {
	const { data: session } = authClient.useSession();
	const router = useRouter();
	const pathname = usePathname();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const isMobile = useIsMobile();
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [actionInFlight, setActionInFlight] = useState(false);

	const { data: organizations } = useQuery(
		trpc.user.myOrganizations.queryOptions(),
	);

	const user = session?.user;
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const activeOrganization = organizations?.find(
		(org) => org.id === activeOrganizationId,
	);

	const displayName = activeOrganization?.name ?? "Organization";

	const handleActionError = (message: string, error: unknown) => {
		console.error(`[AgentsHeader] ${message}`, error);
		toast.error(message);
	};

	const handleSignOut = async () => {
		try {
			await authClient.signOut();
			return true;
		} catch (error) {
			handleActionError("Failed to log out. Please try again.", error);
			return false;
		}
	};

	const handleSwitchOrganization = async (organizationId: string) => {
		if (organizationId === activeOrganizationId) {
			return true;
		}

		try {
			await authClient.organization.setActive({ organizationId });
			await queryClient.invalidateQueries();
			router.refresh();
			return true;
		} catch (error) {
			handleActionError(
				"Failed to switch organization. Please try again.",
				error,
			);
			return false;
		}
	};

	const handleDrawerSignOut = async () => {
		if (actionInFlight) {
			return;
		}

		setActionInFlight(true);

		try {
			const signedOut = await handleSignOut();
			if (!signedOut) {
				return;
			}

			setDrawerOpen(false);
			router.push("/sign-in");
		} finally {
			setActionInFlight(false);
		}
	};

	const handleDrawerOrganizationSelect = async (organizationId: string) => {
		if (actionInFlight) {
			return;
		}

		setActionInFlight(true);

		try {
			const switched = await handleSwitchOrganization(organizationId);
			if (switched) {
				setDrawerOpen(false);
			}
		} finally {
			setActionInFlight(false);
		}
	};

	const handleDropdownSignOut = async () => {
		if (actionInFlight) {
			return;
		}

		setActionInFlight(true);

		try {
			const signedOut = await handleSignOut();
			if (!signedOut) {
				return;
			}

			setDropdownOpen(false);
			router.push("/sign-in");
		} finally {
			setActionInFlight(false);
		}
	};

	const handleDropdownOrganizationSelect = async (organizationId: string) => {
		if (actionInFlight) {
			return;
		}

		setActionInFlight(true);

		try {
			const switched = await handleSwitchOrganization(organizationId);
			if (switched) {
				setDropdownOpen(false);
			}
		} finally {
			setActionInFlight(false);
		}
	};

	const triggerButton = (
		<button
			type="button"
			className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-secondary/50 px-3 py-1.5 transition-all duration-150 hover:border-border hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-label={`Organization menu for ${displayName}`}
			onClick={isMobile ? () => setDrawerOpen(true) : undefined}
		>
			<Avatar className="size-5">
				<AvatarImage
					src={activeOrganization?.logo ?? undefined}
					alt={displayName}
				/>
				<AvatarFallback className="text-[10px]">
					{displayName.charAt(0)}
				</AvatarFallback>
			</Avatar>
			<span className="max-w-32 truncate text-sm font-medium">
				{displayName}
			</span>
			<ChevronDown className="size-4 text-muted-foreground" />
		</button>
	);

	const orgMenu = isMobile ? (
		<>
			{triggerButton}
			<Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
				<DrawerContent>
					<DrawerTitle className="sr-only">Account menu</DrawerTitle>
					<div className="flex flex-col gap-1 p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
						<div className="flex flex-col space-y-1 px-2 py-1.5">
							<p className="text-sm font-medium">{user?.name}</p>
							<p className="text-xs text-muted-foreground">{user?.email}</p>
						</div>
						<div className="my-1 h-px bg-border" />
						{organizations && organizations.length > 1 && (
							<>
								<p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
									Switch organization
								</p>
								{organizations.map((org) => (
									<button
										key={org.id}
										type="button"
										className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
										disabled={actionInFlight}
										onClick={() => {
											void handleDrawerOrganizationSelect(org.id);
										}}
									>
										<Avatar className="size-4">
											<AvatarImage
												src={org.logo ?? undefined}
												alt={org.name ?? "Organization"}
											/>
											<AvatarFallback className="text-[8px]">
												{org.name?.charAt(0) ?? "O"}
											</AvatarFallback>
										</Avatar>
										<span className="flex-1 truncate text-left">
											{org.name}
										</span>
										{org.id === activeOrganizationId && (
											<Check className="size-4 text-primary" />
										)}
									</button>
								))}
								<div className="my-1 h-px bg-border" />
							</>
						)}
						<button
							type="button"
							className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
							disabled={actionInFlight}
							onClick={() => {
								void handleDrawerSignOut();
							}}
						>
							<LogOut className="size-4" />
							<span>Log out</span>
						</button>
					</div>
				</DrawerContent>
			</Drawer>
		</>
	) : (
		<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
			<DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-56">
				<DropdownMenuLabel>
					<div className="flex flex-col space-y-1">
						<p className="text-sm font-medium">{user?.name}</p>
						<p className="text-xs text-muted-foreground">{user?.email}</p>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{organizations && organizations.length > 1 && (
					<>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger className="cursor-pointer">
								<span>Switch organization</span>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
									{user?.email}
								</DropdownMenuLabel>
								{organizations.map((org) => (
									<DropdownMenuItem
										key={org.id}
										className="cursor-pointer gap-2"
										disabled={actionInFlight}
										onSelect={(event) => {
											event.preventDefault();
											void handleDropdownOrganizationSelect(org.id);
										}}
									>
										<Avatar className="size-4">
											<AvatarImage
												src={org.logo ?? undefined}
												alt={org.name ?? "Organization"}
											/>
											<AvatarFallback className="text-[8px]">
												{org.name?.charAt(0) ?? "O"}
											</AvatarFallback>
										</Avatar>
										<span className="flex-1 truncate">{org.name}</span>
										{org.id === activeOrganizationId && (
											<Check className="size-4 text-primary" />
										)}
									</DropdownMenuItem>
								))}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuItem
					className="cursor-pointer gap-2"
					disabled={actionInFlight}
					onSelect={(event) => {
						event.preventDefault();
						void handleDropdownSignOut();
					}}
				>
					<LogOut className="size-4" />
					<span>Log out</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex h-12 w-full items-center justify-between px-4">
				<Link href="/agents" aria-label="Go to home">
					<svg
						width="282"
						height="46"
						viewBox="0 0 282 46"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
						className="h-4 w-auto text-foreground"
						aria-label="Superset"
					>
						<title>Superset</title>
						<path
							d="M18.1818 4.30346e-05H27.2727V9.09095H18.1818V4.30346e-05ZM9.09091 4.30346e-05H18.1818V9.09095H9.09091V4.30346e-05ZM0 9.09095H9.09091V18.1819H0V9.09095ZM0 18.1819H9.09091V27.2728H0V18.1819ZM9.09091 18.1819H18.1818V27.2728H9.09091V18.1819ZM18.1818 18.1819H27.2727V27.2728H18.1818V18.1819ZM18.1818 27.2728H27.2727V36.3637H18.1818V27.2728ZM18.1818 36.3637H27.2727V45.4546H18.1818V36.3637ZM9.09091 36.3637H18.1818V45.4546H9.09091V36.3637ZM0 36.3637H9.09091V45.4546H0V36.3637ZM0 4.30346e-05H9.09091V9.09095H0V4.30346e-05ZM36.3281 4.30346e-05H45.419V9.09095H36.3281V4.30346e-05ZM36.3281 9.09095H45.419V18.1819H36.3281V9.09095ZM36.3281 18.1819H45.419V27.2728H36.3281V18.1819ZM36.3281 27.2728H45.419V36.3637H36.3281V27.2728ZM36.3281 36.3637H45.419V45.4546H36.3281V36.3637ZM45.419 36.3637H54.5099V45.4546H45.419V36.3637ZM54.5099 36.3637H63.6009V45.4546H54.5099V36.3637ZM54.5099 27.2728H63.6009V36.3637H54.5099V27.2728ZM54.5099 18.1819H63.6009V27.2728H54.5099V18.1819ZM54.5099 9.09095H63.6009V18.1819H54.5099V9.09095ZM54.5099 4.30346e-05H63.6009V9.09095H54.5099V4.30346e-05ZM72.6562 4.30346e-05H81.7472V9.09095H72.6562V4.30346e-05ZM72.6562 9.09095H81.7472V18.1819H72.6562V9.09095ZM72.6562 18.1819H81.7472V27.2728H72.6562V18.1819ZM72.6562 27.2728H81.7472V36.3637H72.6562V27.2728ZM72.6562 36.3637H81.7472V45.4546H72.6562V36.3637ZM81.7472 4.30346e-05H90.8381V9.09095H81.7472V4.30346e-05ZM90.8381 4.30346e-05H99.929V9.09095H90.8381V4.30346e-05ZM90.8381 9.09095H99.929V18.1819H90.8381V9.09095ZM90.8381 18.1819H99.929V27.2728H90.8381V18.1819ZM81.7472 18.1819H90.8381V27.2728H81.7472V18.1819ZM108.984 4.30346e-05H118.075V9.09095H108.984V4.30346e-05ZM108.984 9.09095H118.075V18.1819H108.984V9.09095ZM108.984 18.1819H118.075V27.2728H108.984V18.1819ZM108.984 27.2728H118.075V36.3637H108.984V27.2728ZM108.984 36.3637H118.075V45.4546H108.984V36.3637ZM118.075 4.30346e-05H127.166V9.09095H118.075V4.30346e-05ZM118.075 36.3637H127.166V45.4546H118.075V36.3637ZM118.075 18.1819H127.166V27.2728H118.075V18.1819ZM127.166 4.30346e-05H136.257V9.09095H127.166V4.30346e-05ZM127.166 36.3637H136.257V45.4546H127.166V36.3637ZM145.312 36.3637H154.403V45.4546H145.312V36.3637ZM145.312 27.2728H154.403V36.3637H145.312V27.2728ZM145.312 18.1819H154.403V27.2728H145.312V18.1819ZM145.312 9.09095H154.403V18.1819H145.312V9.09095ZM145.312 4.30346e-05H154.403V9.09095H145.312V4.30346e-05ZM154.403 4.30346e-05H163.494V9.09095H154.403V4.30346e-05ZM163.494 4.30346e-05H172.585V9.09095H163.494V4.30346e-05ZM163.494 9.09095H172.585V18.1819H163.494V9.09095ZM154.403 18.1819H163.494V27.2728H154.403V18.1819ZM163.494 27.2728H172.585V36.3637H163.494V27.2728ZM163.494 36.3637H172.585V45.4546H163.494V36.3637ZM199.822 4.30346e-05H208.913V9.09095H199.822V4.30346e-05ZM190.732 4.30346e-05H199.822V9.09095H190.732V4.30346e-05ZM181.641 9.09095H190.732V18.1819H181.641V9.09095ZM181.641 18.1819H190.732V27.2728H181.641V18.1819ZM190.732 18.1819H199.822V27.2728H190.732V18.1819ZM199.822 18.1819H208.913V27.2728H199.822V18.1819ZM199.822 27.2728H208.913V36.3637H199.822V27.2728ZM199.822 36.3637H208.913V45.4546H199.822V36.3637ZM190.732 36.3637H199.822V45.4546H190.732V36.3637ZM181.641 36.3637H190.732V45.4546H181.641V36.3637ZM181.641 4.30346e-05H190.732V9.09095H181.641V4.30346e-05ZM217.969 4.30346e-05H227.06V9.09095H217.969V4.30346e-05ZM217.969 9.09095H227.06V18.1819H217.969V9.09095ZM217.969 18.1819H227.06V27.2728H217.969V18.1819ZM217.969 27.2728H227.06V36.3637H217.969V27.2728ZM217.969 36.3637H227.06V45.4546H217.969V36.3637ZM227.06 4.30346e-05H236.151V9.09095H227.06V4.30346e-05ZM227.06 36.3637H236.151V45.4546H227.06V36.3637ZM227.06 18.1819H236.151V27.2728H227.06V18.1819ZM236.151 4.30346e-05H245.241V9.09095H236.151V4.30346e-05ZM236.151 36.3637H245.241V45.4546H236.151V36.3637ZM254.297 4.30346e-05H263.388V9.09095H254.297V4.30346e-05ZM263.388 4.30346e-05H272.479V9.09095H263.388V4.30346e-05ZM272.479 4.30346e-05H281.57V9.09095H272.479V4.30346e-05ZM263.388 9.09095H272.479V18.1819H263.388V9.09095ZM263.388 18.1819H272.479V27.2728H263.388V18.1819ZM263.388 27.2728H272.479V36.3637H263.388V27.2728ZM263.388 36.3637H272.479V45.4546H263.388V36.3637Z"
							fill="currentColor"
						/>
					</svg>
				</Link>

				<nav className="hidden items-center gap-1 sm:flex">
					{navItems.map((item) => {
						const isActive =
							item.href === "/agents"
								? pathname === "/agents" || pathname.startsWith("/agents/")
								: pathname.startsWith(item.href);

						return (
							<Link
								key={item.href}
								href={item.href}
								className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
									isActive
										? "bg-secondary text-foreground"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{item.label}
							</Link>
						);
					})}
				</nav>

				{orgMenu}
			</div>
		</header>
	);
}
