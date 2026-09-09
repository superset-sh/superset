"use client";

import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { authClient } from "@superset/auth/client";
import {
	ACCOUNT_DELETION_GRACE_DAYS,
	COMPANY,
} from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";

const DAY_MS = 24 * 60 * 60 * 1000;

export default function AccountPendingDeletionPage() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const router = useRouter();
	const { data: session } = authClient.useSession();
	const [isSigningOut, setIsSigningOut] = useState(false);

	const reactivate = useMutation(
		trpc.user.reactivateAccount.mutationOptions({
			onSuccess: () => {
				router.replace("/");
				router.refresh();
			},
		}),
	);

	const deletionRequestedAt = session?.user.deletionRequestedAt;
	const daysRemaining = deletionRequestedAt
		? Math.max(
				0,
				Math.ceil(
					(new Date(deletionRequestedAt).getTime() +
						ACCOUNT_DELETION_GRACE_DAYS * DAY_MS -
						Date.now()) /
						DAY_MS,
				),
			)
		: null;

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6">
			<AlertTriangle className="size-12 text-destructive" />
			<div className="max-w-md text-center">
				<h1 className="text-lg font-medium">
					<Trans>Account pending deletion</Trans>
				</h1>
				<p className="text-sm text-muted-foreground">
					{daysRemaining !== null && daysRemaining > 0
						? t({
								message: plural(daysRemaining, {
									one: "Your account is deactivated and will be permanently deleted in # day. Reactivate to restore it exactly as you left it.",
									other:
										"Your account is deactivated and will be permanently deleted in # days. Reactivate to restore it exactly as you left it.",
								}),
							})
						: t({
								message:
									"Your account is deactivated and will be permanently deleted soon. Reactivate to restore it exactly as you left it.",
							})}
				</p>
			</div>
			{reactivate.error && (
				<p className="text-sm text-destructive">{reactivate.error.message}</p>
			)}
			<div className="flex gap-2">
				<Button
					size="sm"
					disabled={reactivate.isPending}
					onClick={() => reactivate.mutate()}
				>
					{reactivate.isPending ? (
						<Trans>Reactivating…</Trans>
					) : (
						<Trans>Reactivate my account</Trans>
					)}
				</Button>
				<Button variant="outline" size="sm" asChild>
					<a href={COMPANY.MAIL_TO}>
						<Trans>Contact support</Trans>
					</a>
				</Button>
				<Button
					variant="outline"
					size="sm"
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
		</div>
	);
}
