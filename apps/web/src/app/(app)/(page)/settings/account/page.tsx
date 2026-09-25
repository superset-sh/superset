"use client";

import { Trans } from "@lingui/react/macro";
import { authClient } from "@superset/auth/client";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@superset/shared/constants";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";

export default function AccountSettingsPage() {
	const trpc = useTRPC();
	const router = useRouter();
	const { data: session } = authClient.useSession();
	const user = session?.user;
	const [isSigningOut, setIsSigningOut] = useState(false);

	const deleteAccount = useMutation(
		trpc.user.deleteAccount.mutationOptions({
			onSuccess: async () => {
				await authClient.signOut();
				router.replace("/sign-in");
			},
		}),
	);

	return (
		<div className="max-w-2xl space-y-8">
			<div>
				<h2 className="text-xl font-medium">
					<Trans>Account</Trans>
				</h2>
				{user && (
					<p className="mt-1 text-sm text-muted-foreground">
						{user.name} · {user.email}
					</p>
				)}
			</div>

			<div className="flex items-center justify-between gap-8 border-t pt-6">
				<div>
					<div className="text-sm font-medium">
						<Trans>Sign out</Trans>
					</div>
				</div>
				<Button
					variant="outline"
					disabled={isSigningOut}
					onClick={async () => {
						setIsSigningOut(true);
						try {
							await authClient.signOut();
						} finally {
							router.replace("/sign-in");
						}
					}}
				>
					<Trans>Sign out</Trans>
				</Button>
			</div>

			<div className="flex items-center justify-between gap-8 border-t pt-6">
				<div>
					<div className="text-sm font-medium">
						<Trans>Delete account</Trans>
					</div>
					{deleteAccount.error && (
						<div className="mt-1 text-sm text-destructive">
							{deleteAccount.error.message}
						</div>
					)}
				</div>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="destructive" disabled={deleteAccount.isPending}>
							{deleteAccount.isPending ? (
								<Trans>Deleting…</Trans>
							) : (
								<Trans>Delete account</Trans>
							)}
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								<Trans>Delete account?</Trans>
							</AlertDialogTitle>
							<AlertDialogDescription>
								<Trans>
									All of your data will be permanently deleted after{" "}
									{ACCOUNT_DELETION_GRACE_DAYS} days — sign back in before then
									to restore your account.
								</Trans>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>
								<Trans>Cancel</Trans>
							</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								onClick={() => deleteAccount.mutate()}
							>
								<Trans>Delete account</Trans>
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	);
}
