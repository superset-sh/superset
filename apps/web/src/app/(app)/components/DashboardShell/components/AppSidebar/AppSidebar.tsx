"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { authClient } from "@superset/auth/client";
import { i18n } from "@superset/i18n";
import { isPaidPlan } from "@superset/shared/billing";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
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
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@superset/ui/sheet";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Blocks,
	Bot,
	Check,
	ChevronsUpDown,
	ExternalLink,
	Home,
	LogOut,
	type LucideIcon,
	Menu,
	User,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

interface NavItem {
	href: string;
	label: MessageDescriptor;
	icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
	{ href: "/", label: msg({ message: "Home" }), icon: Home },
	{ href: "/agents", label: msg({ message: "Agents" }), icon: Bot },
	{
		href: "/integrations",
		label: msg({ message: "Integrations" }),
		icon: Blocks,
	},
	{
		href: "/settings/account",
		label: msg({ message: "Account" }),
		icon: User,
	},
];

const SIDEBAR_SURFACE = "border-border bg-sidebar dark:bg-muted/35";

function isNavItemActive(pathname: string, href: string) {
	return pathname === href || pathname.startsWith(`${href}/`);
}

function Wordmark() {
	return (
		<svg
			width="282"
			height="46"
			viewBox="0 0 282 46"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className="h-3.5 w-auto text-foreground"
			aria-label="Superset"
		>
			<title>Superset</title>
			<path
				d="M18.1818 4.30346e-05H27.2727V9.09095H18.1818V4.30346e-05ZM9.09091 4.30346e-05H18.1818V9.09095H9.09091V4.30346e-05ZM0 9.09095H9.09091V18.1819H0V9.09095ZM0 18.1819H9.09091V27.2728H0V18.1819ZM9.09091 18.1819H18.1818V27.2728H9.09091V18.1819ZM18.1818 18.1819H27.2727V27.2728H18.1818V18.1819ZM18.1818 27.2728H27.2727V36.3637H18.1818V27.2728ZM18.1818 36.3637H27.2727V45.4546H18.1818V36.3637ZM9.09091 36.3637H18.1818V45.4546H9.09091V36.3637ZM0 36.3637H9.09091V45.4546H0V36.3637ZM0 4.30346e-05H9.09091V9.09095H0V4.30346e-05ZM36.3281 4.30346e-05H45.419V9.09095H36.3281V4.30346e-05ZM36.3281 9.09095H45.419V18.1819H36.3281V9.09095ZM36.3281 18.1819H45.419V27.2728H36.3281V18.1819ZM36.3281 27.2728H45.419V36.3637H36.3281V27.2728ZM36.3281 36.3637H45.419V45.4546H36.3281V36.3637ZM45.419 36.3637H54.5099V45.4546H45.419V36.3637ZM54.5099 36.3637H63.6009V45.4546H54.5099V36.3637ZM54.5099 27.2728H63.6009V36.3637H54.5099V27.2728ZM54.5099 18.1819H63.6009V27.2728H54.5099V18.1819ZM54.5099 9.09095H63.6009V18.1819H54.5099V9.09095ZM54.5099 4.30346e-05H63.6009V9.09095H54.5099V4.30346e-05ZM72.6562 4.30346e-05H81.7472V9.09095H72.6562V4.30346e-05ZM72.6562 9.09095H81.7472V18.1819H72.6562V9.09095ZM72.6562 18.1819H81.7472V27.2728H72.6562V18.1819ZM72.6562 27.2728H81.7472V36.3637H72.6562V27.2728ZM72.6562 36.3637H81.7472V45.4546H72.6562V36.3637ZM81.7472 4.30346e-05H90.8381V9.09095H81.7472V4.30346e-05ZM90.8381 4.30346e-05H99.929V9.09095H90.8381V4.30346e-05ZM90.8381 9.09095H99.929V18.1819H90.8381V9.09095ZM90.8381 18.1819H99.929V27.2728H90.8381V18.1819ZM81.7472 18.1819H90.8381V27.2728H81.7472V18.1819ZM108.984 4.30346e-05H118.075V9.09095H108.984V4.30346e-05ZM108.984 9.09095H118.075V18.1819H108.984V9.09095ZM108.984 18.1819H118.075V27.2728H108.984V18.1819ZM108.984 27.2728H118.075V36.3637H108.984V27.2728ZM108.984 36.3637H118.075V45.4546H108.984V36.3637ZM118.075 4.30346e-05H127.166V9.09095H118.075V4.30346e-05ZM118.075 36.3637H127.166V45.4546H118.075V36.3637ZM118.075 18.1819H127.166V27.2728H118.075V18.1819ZM127.166 4.30346e-05H136.257V9.09095H127.166V4.30346e-05ZM127.166 36.3637H136.257V45.4546H127.166V36.3637ZM145.312 36.3637H154.403V45.4546H145.312V36.3637ZM145.312 27.2728H154.403V36.3637H145.312V27.2728ZM145.312 18.1819H154.403V27.2728H145.312V18.1819ZM145.312 9.09095H154.403V18.1819H145.312V9.09095ZM145.312 4.30346e-05H154.403V9.09095H145.312V4.30346e-05ZM154.403 4.30346e-05H163.494V9.09095H154.403V4.30346e-05ZM163.494 4.30346e-05H172.585V9.09095H163.494V4.30346e-05ZM163.494 9.09095H172.585V18.1819H163.494V9.09095ZM154.403 18.1819H163.494V27.2728H154.403V18.1819ZM163.494 27.2728H172.585V36.3637H163.494V27.2728ZM163.494 36.3637H172.585V45.4546H163.494V36.3637ZM199.822 4.30346e-05H208.913V9.09095H199.822V4.30346e-05ZM190.732 4.30346e-05H199.822V9.09095H190.732V4.30346e-05ZM181.641 9.09095H190.732V18.1819H181.641V9.09095ZM181.641 18.1819H190.732V27.2728H181.641V18.1819ZM190.732 18.1819H199.822V27.2728H190.732V18.1819ZM199.822 18.1819H208.913V27.2728H199.822V18.1819ZM199.822 27.2728H208.913V36.3637H199.822V27.2728ZM199.822 36.3637H208.913V45.4546H199.822V36.3637ZM190.732 36.3637H199.822V45.4546H190.732V36.3637ZM181.641 36.3637H190.732V45.4546H181.641V36.3637ZM181.641 4.30346e-05H190.732V9.09095H181.641V4.30346e-05ZM217.969 4.30346e-05H227.06V9.09095H217.969V4.30346e-05ZM217.969 9.09095H227.06V18.1819H217.969V9.09095ZM217.969 18.1819H227.06V27.2728H217.969V18.1819ZM217.969 27.2728H227.06V36.3637H217.969V27.2728ZM217.969 36.3637H227.06V45.4546H217.969V36.3637ZM227.06 4.30346e-05H236.151V9.09095H227.06V4.30346e-05ZM227.06 36.3637H236.151V45.4546H227.06V36.3637ZM227.06 18.1819H236.151V27.2728H227.06V18.1819ZM236.151 4.30346e-05H245.241V9.09095H236.151V4.30346e-05ZM236.151 36.3637H245.241V45.4546H236.151V36.3637ZM254.297 4.30346e-05H263.388V9.09095H254.297V4.30346e-05ZM263.388 4.30346e-05H272.479V9.09095H263.388V4.30346e-05ZM272.479 4.30346e-05H281.57V9.09095H272.479V4.30346e-05ZM263.388 9.09095H272.479V18.1819H263.388V9.09095ZM263.388 18.1819H272.479V27.2728H263.388V18.1819ZM263.388 27.2728H272.479V36.3637H263.388V27.2728ZM263.388 36.3637H272.479V45.4546H263.388V36.3637Z"
				fill="currentColor"
			/>
		</svg>
	);
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
	const pathname = usePathname();

	return (
		<nav className="flex flex-col gap-px px-2">
			{NAV_ITEMS.map((item) => {
				const isActive = isNavItemActive(pathname, item.href);
				const Icon = item.icon;
				return (
					<Link
						key={item.href}
						href={item.href}
						aria-current={isActive ? "page" : undefined}
						onClick={onNavigate}
						className={cn(
							"flex h-7 items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
							isActive
								? "bg-fill-selected text-foreground"
								: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
						)}
					>
						<Icon
							className="size-4 shrink-0 text-muted-foreground"
							strokeWidth={1.5}
						/>
						<span className="flex-1 truncate text-left">
							{i18n._(item.label)}
						</span>
					</Link>
				);
			})}
		</nav>
	);
}

function OrganizationMenu() {
	const { t } = useLingui();
	const { data: session } = authClient.useSession();
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [actionInFlight, setActionInFlight] = useState(false);

	const { data: organizations } = useQuery(
		trpc.user.myOrganizations.queryOptions(),
	);
	const { data: activePlan } = useQuery(trpc.billing.activePlan.queryOptions());

	const isPro = isPaidPlan(activePlan?.plan);
	const planLabel =
		isPro && activePlan?.plan
			? activePlan.plan.charAt(0).toUpperCase() + activePlan.plan.slice(1)
			: null;

	const user = session?.user;
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const activeOrganization = organizations?.find(
		(org) => org.id === activeOrganizationId,
	);
	const displayName =
		activeOrganization?.name ?? user?.name ?? t({ message: "Organization" });

	const runAction = async (
		action: () => Promise<void>,
		failureMessage: string,
		logContext: string,
	) => {
		if (actionInFlight) return;
		setActionInFlight(true);
		try {
			await action();
		} catch (error) {
			console.error(`[AppSidebar] ${logContext}`, error);
			toast.error(failureMessage);
		} finally {
			setActionInFlight(false);
		}
	};

	const handleSignOut = () =>
		runAction(
			async () => {
				await authClient.signOut();
				router.push("/sign-in");
			},
			t({ message: "Failed to log out. Please try again." }),
			"sign out failed",
		);

	const handleSwitchOrganization = (organizationId: string) => {
		if (organizationId === activeOrganizationId) return;
		void runAction(
			async () => {
				await authClient.organization.setActive({ organizationId });
				await queryClient.invalidateQueries();
				router.refresh();
			},
			t({ message: "Failed to switch organization. Please try again." }),
			"switch organization failed",
		);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
					aria-label={t({ message: "Organization menu" })}
				>
					<Avatar className="size-4 shrink-0 rounded">
						<AvatarImage
							src={activeOrganization?.logo ?? undefined}
							alt={displayName}
						/>
						<AvatarFallback className="rounded text-[9px]">
							{displayName.charAt(0)}
						</AvatarFallback>
					</Avatar>
					<span className="truncate">{displayName}</span>
					{planLabel && (
						<Badge
							variant="default"
							className="h-3.5 px-1 py-0 text-[9px] uppercase leading-none tracking-wide"
						>
							{planLabel}
						</Badge>
					)}
					<ChevronsUpDown className="ml-auto size-3.5 shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56"
			>
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
								<Trans>Switch organization</Trans>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								{organizations.map((org) => (
									<DropdownMenuItem
										key={org.id}
										className="cursor-pointer gap-2"
										disabled={actionInFlight}
										onSelect={(event) => {
											event.preventDefault();
											handleSwitchOrganization(org.id);
										}}
									>
										<Avatar className="size-4 rounded">
											<AvatarImage
												src={org.logo ?? undefined}
												alt={org.name ?? t({ message: "Organization" })}
											/>
											<AvatarFallback className="rounded text-[8px]">
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
				<DropdownMenuItem asChild className="cursor-pointer gap-2">
					<a
						href={`${env.NEXT_PUBLIC_MARKETING_URL}/terms`}
						target="_blank"
						rel="noopener noreferrer"
					>
						<ExternalLink className="size-4" />
						<Trans>Terms of Service</Trans>
					</a>
				</DropdownMenuItem>
				<DropdownMenuItem asChild className="cursor-pointer gap-2">
					<a
						href={`${env.NEXT_PUBLIC_MARKETING_URL}/privacy`}
						target="_blank"
						rel="noopener noreferrer"
					>
						<ExternalLink className="size-4" />
						<Trans>Privacy Policy</Trans>
					</a>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="cursor-pointer gap-2"
					disabled={actionInFlight}
					onSelect={(event) => {
						event.preventDefault();
						void handleSignOut();
					}}
				>
					<LogOut className="size-4" />
					<Trans>Log out</Trans>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
	const { t } = useLingui();

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-12 shrink-0 items-center px-4">
				<Link href="/" aria-label={t({ message: "Go to home" })}>
					<Wordmark />
				</Link>
			</div>
			<SidebarNav onNavigate={onNavigate} />
			<div className="flex-1" />
			<div className="p-2">
				<OrganizationMenu />
			</div>
		</div>
	);
}

export function AppSidebar() {
	const { t } = useLingui();
	const [sheetOpen, setSheetOpen] = useState(false);

	return (
		<>
			<header
				className={cn(
					"flex h-12 shrink-0 items-center gap-1 border-b px-2 md:hidden",
					SIDEBAR_SURFACE,
				)}
			>
				<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
					<SheetTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={t({ message: "Open navigation" })}
						>
							<Menu className="size-4" />
						</Button>
					</SheetTrigger>
					<SheetContent side="left" className="w-64 gap-0 border-border p-0">
						<SheetTitle className="sr-only">
							<Trans>Navigation</Trans>
						</SheetTitle>
						{/* The translucent sidebar tint needs the opaque sheet under it. */}
						<div className={cn("h-full", SIDEBAR_SURFACE)}>
							<SidebarBody onNavigate={() => setSheetOpen(false)} />
						</div>
					</SheetContent>
				</Sheet>
				<Link
					href="/"
					aria-label={t({ message: "Go to home" })}
					className="px-2"
				>
					<Wordmark />
				</Link>
			</header>
			<aside
				className={cn(
					"hidden h-full w-56 shrink-0 border-r md:block",
					SIDEBAR_SURFACE,
				)}
			>
				<SidebarBody />
			</aside>
		</>
	);
}
