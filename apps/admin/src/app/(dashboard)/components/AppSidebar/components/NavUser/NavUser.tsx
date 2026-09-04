"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { authClient } from "@superset/auth/client";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@superset/ui/sidebar";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
	LuBadgeCheck,
	LuBell,
	LuChevronsUpDown,
	LuKeyRound,
	LuLoaderCircle,
	LuLogOut,
	LuSettings,
} from "react-icons/lu";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

/** Everything the footer renders. The session already carries all of it, so
 *  the dashboard layout no longer blocks its shell on a `user.me` round trip
 *  to the api deployment just to fill in a name and an avatar. */
export interface SidebarUser {
	name: string;
	email: string;
	image?: string | null;
}

export interface NavUserProps {
	user: SidebarUser;
}

export function NavUser({ user }: NavUserProps) {
	const { isMobile } = useSidebar();
	const { t } = useLingui();
	const trpc = useTRPC();

	const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
	const [newPassword, setNewPassword] = useState("");

	const setPasswordMutation = useMutation(
		trpc.admin.setMyPassword.mutationOptions({
			onSuccess: () => {
				toast.success(t({ message: "Password set" }));
				setPasswordDialogOpen(false);
				setNewPassword("");
			},
			onError: (error) => {
				toast.error(
					t({
						message: `Failed to set password: ${error.message}`,
					}),
				);
			},
		}),
	);

	const handleSetPassword = () => {
		if (newPassword.length < 8) return;
		setPasswordMutation.mutate({ password: newPassword });
	};

	const userInitials = user.name
		.split(" ")
		.map((name) => name[0])
		.join("");

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = env.NEXT_PUBLIC_WEB_URL;
				},
			},
		});
	};

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<Avatar className="h-8 w-8 rounded-lg">
								<AvatarImage src={user.image ?? undefined} alt={user.name} />
								<AvatarFallback className="rounded-lg">
									{userInitials}
								</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{user.name}</span>
								<span className="truncate text-xs">{user.email}</span>
							</div>
							<LuChevronsUpDown className="ml-auto size-4" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuLabel className="p-0 font-normal">
							<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
								<Avatar className="h-8 w-8 rounded-lg">
									<AvatarImage src={user.image ?? undefined} alt={user.name} />
									<AvatarFallback className="rounded-lg">
										{userInitials}
									</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">{user.name}</span>
									<span className="truncate text-xs">{user.email}</span>
								</div>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem>
								<LuBadgeCheck />
								<Trans>Account</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setPasswordDialogOpen(true)}>
								<LuKeyRound />
								<Trans>Set password</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem>
								<LuSettings />
								<Trans>Settings</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem>
								<LuBell />
								<Trans>Notifications</Trans>
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={handleSignOut}>
							<LuLogOut />
							<Trans>Log out</Trans>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				<Dialog
					open={passwordDialogOpen}
					onOpenChange={(open) => {
						setPasswordDialogOpen(open);
						if (!open) setNewPassword("");
					}}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>
								<Trans>Set password</Trans>
							</DialogTitle>
							<DialogDescription>
								<Trans>
									Sets an email+password credential for{" "}
									<strong>{user.email}</strong> via Better Auth (hashed with
									scrypt). Existing sign-in methods keep working.
								</Trans>
							</DialogDescription>
						</DialogHeader>
						<Input
							type="password"
							autoComplete="new-password"
							placeholder={t({
								message: "New password (min 8 characters)",
							})}
							value={newPassword}
							onChange={(event) => setNewPassword(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") handleSetPassword();
							}}
						/>
						<DialogFooter>
							<Button
								onClick={handleSetPassword}
								disabled={
									newPassword.length < 8 || setPasswordMutation.isPending
								}
							>
								{setPasswordMutation.isPending ? (
									<LuLoaderCircle className="mr-2 h-4 w-4 animate-spin" />
								) : null}
								<Trans>Set Password</Trans>
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
