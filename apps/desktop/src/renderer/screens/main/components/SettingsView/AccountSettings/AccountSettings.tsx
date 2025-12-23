import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { env } from "renderer/env.renderer";
import { trpc } from "renderer/lib/trpc";

export function AccountSettings() {
	const { data: user, isLoading } = trpc.user.me.useQuery();
	const signOutMutation = trpc.auth.signOut.useMutation({
		onSuccess: () => toast.success("Signed out"),
	});
	const triggerMainErrorMutation = trpc.settings.triggerTestError.useMutation({
		onError: (error) => toast.error(`Main process error: ${error.message}`),
	});

	const signOut = () => signOutMutation.mutate();

	const triggerRendererError = () => {
		throw new Error("Test error from renderer process (Sentry test)");
	};

	const triggerMainError = () => {
		triggerMainErrorMutation.mutate();
	};

	const initials = user?.name
		?.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

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
								<Avatar className="h-16 w-16">
									<AvatarImage src={user.avatarUrl ?? undefined} />
									<AvatarFallback className="text-lg">
										{initials || "?"}
									</AvatarFallback>
								</Avatar>
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

				{/* Developer Section - only in development */}
				{env.NODE_ENV === "development" && (
					<div className="pt-6 border-t">
						<h3 className="text-sm font-medium mb-2">Developer</h3>
						<p className="text-sm text-muted-foreground mb-4">
							Test Sentry error reporting.
						</p>
						<div className="flex gap-2">
							<Button variant="outline" onClick={triggerRendererError}>
								Test Renderer Error
							</Button>
							<Button variant="outline" onClick={triggerMainError}>
								Test Main Process Error
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
