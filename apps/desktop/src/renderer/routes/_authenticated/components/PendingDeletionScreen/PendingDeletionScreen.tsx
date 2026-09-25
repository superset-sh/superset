import {
	ACCOUNT_DELETION_GRACE_DAYS,
	COMPANY,
} from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HiOutlineExclamationTriangle } from "react-icons/hi2";
import { useSignOut } from "renderer/hooks/useSignOut";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const DAY_MS = 24 * 60 * 60 * 1000;

export function PendingDeletionScreen({
	deletionRequestedAt,
	onReactivated,
}: {
	deletionRequestedAt: Date;
	onReactivated: () => void;
}) {
	const navigate = useNavigate();
	const signOut = useSignOut();
	const [isSigningOut, setIsSigningOut] = useState(false);

	const reactivate = cloudTrpc.user.reactivateAccount.useMutation({
		onSuccess: onReactivated,
	});

	const purgeAt =
		new Date(deletionRequestedAt).getTime() +
		ACCOUNT_DELETION_GRACE_DAYS * DAY_MS;
	const daysRemaining = Math.max(0, Math.ceil((purgeAt - Date.now()) / DAY_MS));

	return (
		<div className="relative flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
			<div className="drag absolute inset-x-0 top-0 h-12" />
			<HiOutlineExclamationTriangle className="size-12 text-destructive" />
			<div className="text-center select-text cursor-text">
				<h2 className="text-lg font-medium">Account pending deletion</h2>
				<p className="text-sm text-muted-foreground max-w-md">
					Your account is deactivated and will be permanently deleted
					{daysRemaining > 0
						? ` in ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"}`
						: " soon"}
					. Reactivate to restore it exactly as you left it.
				</p>
			</div>
			{reactivate.error && (
				<p className="text-sm text-destructive select-text cursor-text">
					{reactivate.error.message}
				</p>
			)}
			<div className="flex gap-2">
				<Button
					size="sm"
					disabled={reactivate.isPending}
					onClick={() => reactivate.mutate()}
				>
					{reactivate.isPending ? "Reactivating…" : "Reactivate my account"}
				</Button>
				<Button variant="outline" size="sm" asChild>
					<a href={COMPANY.MAIL_TO}>Contact support</a>
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={isSigningOut}
					onClick={async () => {
						setIsSigningOut(true);
						try {
							await signOut();
						} finally {
							void navigate({ to: "/sign-in", replace: true });
						}
					}}
				>
					Sign out
				</Button>
			</div>
		</div>
	);
}
