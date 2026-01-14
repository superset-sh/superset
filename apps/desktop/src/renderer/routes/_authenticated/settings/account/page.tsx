import { authClient } from "@superset/auth/client";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { createFileRoute } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute("/_authenticated/settings/account/")({
	component: AccountSettingsPage,
});

function AccountSettingsPage() {
	const { data: session, isPending: isLoading } = authClient.useSession();
	const user = session?.user;
	const signOutMutation = electronTrpc.auth.signOut.useMutation({
		onSuccess: () => toast.success("Signed out"),
	});

	const signOut = () => signOutMutation.mutate();

	return (
		<div className="p-6 max-w-4xl">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Account</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Manage your account settings
				</p>
			</div>

			<div className="space-y-8">
				{/* Profile Section */}
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
								<Avatar size="xl" fullName={user.name} image={user.image} />
								<div>
									<p className="font-medium text-lg">{user.name}</p>
									<p className="text-sm text-muted-foreground">{user.email}</p>
								</div>
							</>
						) : (
							<p className="text-muted-foreground">Unable to load user info</p>
						)}
					</div>
				</div>

				{/* Sign Out Section */}
				<div className="pt-6 border-t">
					<h3 className="text-sm font-medium mb-2">Sign Out</h3>
					<p className="text-sm text-muted-foreground mb-4">
						Sign out of your Superset account on this device.
					</p>
					<Button variant="outline" onClick={() => signOut()}>
						Sign Out
					</Button>
				</div>
			</div>
		</div>
	);
}
