import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { HiOutlineClipboardDocument } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { AUTO_UPDATE_STATUS } from "shared/auto-update";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../settings-search";

interface AccountSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function AccountSettings({ visibleItems }: AccountSettingsProps) {
	const showProfile = isItemVisible(
		SETTING_ITEM_ID.ACCOUNT_PROFILE,
		visibleItems,
	);
	const showVersion = isItemVisible(
		SETTING_ITEM_ID.ACCOUNT_VERSION,
		visibleItems,
	);
	const showSignOut = isItemVisible(
		SETTING_ITEM_ID.ACCOUNT_SIGNOUT,
		visibleItems,
	);
	const { data: user, isLoading } = trpc.user.me.useQuery();
	const { data: version } = trpc.autoUpdate.getVersion.useQuery();
	const { data: updateStatus } = trpc.autoUpdate.getStatus.useQuery();
	const checkForUpdatesMutation = trpc.autoUpdate.checkForUpdates.useMutation();
	const signOutMutation = trpc.auth.signOut.useMutation({
		onSuccess: () => toast.success("Signed out"),
	});

	const signOut = () => signOutMutation.mutate();
	const isChecking = updateStatus?.status === AUTO_UPDATE_STATUS.CHECKING;

	const initials = user?.name
		?.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	return (
		<div className="p-6 max-w-4xl min-w-[500px]">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Account</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Manage your account settings
				</p>
			</div>

			<div className="space-y-8">
				{/* Profile Section */}
				{showProfile && (
					<div>
						<h3 className="text-sm font-medium mb-4">Profile</h3>
						<div className="flex items-center gap-4 p-4 rounded-lg border bg-card">
							{isLoading ? (
								<>
									<Skeleton className="h-16 w-16 rounded-full" />
									<div className="space-y-2">
										<Skeleton className="h-5 w-32" />
										<Skeleton className="h-4 w-48" />
									</div>
								</>
							) : user ? (
								<>
									<Avatar className="h-16 w-16">
										<AvatarImage src={user.avatarUrl ?? undefined} />
										<AvatarFallback className="text-lg">
											{initials || "?"}
										</AvatarFallback>
									</Avatar>
									<div>
										<p className="font-medium text-lg">{user.name}</p>
										<p className="text-sm text-muted-foreground">
											{user.email}
										</p>
									</div>
								</>
							) : (
								<p className="text-muted-foreground">
									Unable to load user info
								</p>
							)}
						</div>
					</div>
				)}

				{/* Version */}
				{showVersion && (
					<div className="pt-6 border-t">
						<div className="flex items-start justify-between">
							<div className="space-y-1">
								<p className="text-sm text-muted-foreground">Version</p>
								<button
									type="button"
									className="flex items-center gap-2 text-sm font-mono hover:text-foreground text-muted-foreground"
									onClick={() => {
										navigator.clipboard.writeText(version ?? "");
									}}
								>
									<HiOutlineClipboardDocument className="h-4 w-4" />
									{version}
								</button>
							</div>
							<div className="text-right space-y-1">
								<button
									type="button"
									className="text-sm text-primary hover:underline disabled:opacity-50"
									onClick={() => checkForUpdatesMutation.mutate()}
									disabled={isChecking}
								>
									Check for updates
								</button>
								<p className="text-sm text-muted-foreground">
									{isChecking ? "Checking..." : "Up to date"}
								</p>
							</div>
						</div>
					</div>
				)}

				{/* Sign Out */}
				{showSignOut && (
					<div className="pt-6 border-t">
						<Button variant="outline" onClick={() => signOut()}>
							Sign Out
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
