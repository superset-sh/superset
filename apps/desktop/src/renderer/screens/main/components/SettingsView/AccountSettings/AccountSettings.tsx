import { Button } from "@superset/ui/button";
import { useAuth } from "renderer/contexts/AuthProvider";

export function AccountSettings() {
	const { session, isLoading, isAuthenticated, signIn, signUp, signOut } =
		useAuth();

	if (isLoading) {
		return (
			<div className="w-full max-w-2xl p-6">
				<h1 className="text-2xl font-semibold mb-6">Account</h1>
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	if (isAuthenticated && session) {
		return (
			<div className="w-full max-w-2xl p-6">
				<h1 className="text-2xl font-semibold mb-6">Account</h1>

				<div className="rounded-lg border border-border bg-card p-6">
					<div className="flex items-center gap-4 mb-6">
						{session.imageUrl && (
							<img
								src={session.imageUrl}
								alt="Profile"
								className="w-16 h-16 rounded-full"
							/>
						)}
						<div>
							<h2 className="text-lg font-medium">
								{session.firstName} {session.lastName}
							</h2>
							{session.email && (
								<p className="text-sm text-muted-foreground">{session.email}</p>
							)}
						</div>
					</div>

					<Button variant="outline" onClick={signOut}>
						Sign Out
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full max-w-2xl p-6">
			<h1 className="text-2xl font-semibold mb-6">Account</h1>

			<div className="rounded-lg border border-border bg-card p-6">
				<p className="text-muted-foreground mb-4">
					Sign in to access additional features and sync your settings across
					devices.
				</p>

				<div className="flex gap-3">
					<Button onClick={signIn}>Sign In</Button>
					<Button variant="outline" onClick={signUp}>
						Sign Up
					</Button>
				</div>
			</div>
		</div>
	);
}
