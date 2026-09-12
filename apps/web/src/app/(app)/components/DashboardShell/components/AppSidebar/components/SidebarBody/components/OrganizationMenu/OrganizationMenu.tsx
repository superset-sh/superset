"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { authClient } from "@superset/auth/client";
import { isPaidPlan } from "@superset/shared/billing";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Badge } from "@superset/ui/badge";
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
import { toast } from "@superset/ui/sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, ExternalLink, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

export function OrganizationMenu() {
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
