"use client";

import { authClient } from "@superset/auth/client";
import type { RouterOutputs } from "@superset/trpc";
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

export interface NavUserProps {
	user: NonNullable<RouterOutputs["user"]["me"]>;
}

export function NavUser({ user }: NavUserProps) {
	const { isMobile } = useSidebar();
	const trpc = useTRPC();

	const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
	const [newPassword, setNewPassword] = useState("");

	const setPasswordMutation = useMutation(
		trpc.admin.setMyPassword.mutationOptions({
			onSuccess: () => {
				toast.success("Password set");
				setPasswordDialogOpen(false);
				setNewPassword("");
			},
			onError: (error) => {
				toast.error(`Failed to set password: ${error.message}`);
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
								Account
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setPasswordDialogOpen(true)}>
								<LuKeyRound />
								Set password
							</DropdownMenuItem>
							<DropdownMenuItem>
								<LuSettings />
								Settings
							</DropdownMenuItem>
							<DropdownMenuItem>
								<LuBell />
								Notifications
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={handleSignOut}>
							<LuLogOut />
							Log out
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
							<DialogTitle>Set password</DialogTitle>
							<DialogDescription>
								Sets an email+password credential for{" "}
								<strong>{user.email}</strong> via Better Auth (hashed with
								scrypt). Existing sign-in methods keep working.
							</DialogDescription>
						</DialogHeader>
						<Input
							type="password"
							autoComplete="new-password"
							placeholder="New password (min 8 characters)"
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
								Set Password
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
