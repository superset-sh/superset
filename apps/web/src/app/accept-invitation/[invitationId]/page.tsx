import { msg } from "@lingui/core/macro";
import { Button } from "@superset/ui/button";
import { TRPCClientError } from "@trpc/client";
import { Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { i18n } from "@/lib/i18n-server";
import { api } from "../../../trpc/server";
import { AcceptInvitationButton } from "./AcceptInvitationButton";

interface PageProps {
	params: Promise<{ invitationId: string }>;
	searchParams: Promise<{ token?: string }>;
}

function isInvitationNotFoundError(error: unknown) {
	return (
		error instanceof TRPCClientError &&
		(error.data?.code === "NOT_FOUND" ||
			error.shape?.data?.code === "NOT_FOUND")
	);
}

export default async function AcceptInvitationPage({
	params,
	searchParams,
}: PageProps) {
	const { invitationId } = await params;
	const { token } = await searchParams;
	const trpc = await api();

	let invitation: Awaited<
		ReturnType<typeof trpc.organization.getInvitationPreview.query>
	> | null;

	if (!token) {
		invitation = null;
	} else {
		try {
			invitation = await trpc.organization.getInvitationPreview.query({
				invitationId,
				token,
			});
		} catch (error) {
			if (isInvitationNotFoundError(error)) {
				invitation = null;
			} else {
				console.error(
					"[accept-invitation] Failed to load invitation preview",
					error,
				);
				throw error;
			}
		}
	}

	if (
		!invitation ||
		invitation.isExpired ||
		invitation.status !== "pending" ||
		!token
	) {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<div className="max-w-lg space-y-6 text-center">
					<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl border border-border">
						<Users className="h-8 w-8 text-muted-foreground" />
					</div>
					<div className="space-y-4">
						<h1 className="text-2xl font-semibold">
							{i18n._(
								msg({
									message: "Invitation link does not exist",
								}),
							)}
						</h1>
						<p className="text-muted-foreground">
							{i18n._(
								msg({
									message:
										"The team invitation has either expired or doesn't exist. Request a new link from the team owner or check the URL to make sure it is entered correctly.",
								}),
							)}
						</p>
					</div>
					<Button asChild variant="outline">
						<Link href="/">
							{i18n._(
								msg({
									message: "Return to dashboard",
								}),
							)}
						</Link>
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<div className="max-w-lg space-y-6 text-center">
				{invitation.organization.logo && (
					<div className="relative mx-auto h-16 w-16">
						{/* unoptimized: the URL is already a 256px square, resized and
						    re-encoded by Cloudflare and cached at its edge. Without
						    this, Vercel's optimizer fetches that and re-encodes it a
						    second time, for a logo rendered at 64px. */}
						<Image
							src={invitation.organization.logo}
							alt={invitation.organization.name}
							fill
							unoptimized
							className="rounded-lg object-contain"
						/>
					</div>
				)}

				<div className="space-y-4">
					<h1 className="text-2xl font-semibold">
						{i18n._({
							...msg({
								message: "You've been invited to join {organization}",
							}),
							values: { organization: invitation.organization.name },
						})}
					</h1>
					<p className="text-muted-foreground">
						{i18n._({
							...msg({
								message: "{inviter} invited you to join as a {role}.",
							}),
							values: {
								inviter: invitation.inviter.name,
								role: invitation.role,
							},
						})}
					</p>
				</div>

				<AcceptInvitationButton invitationId={invitationId} token={token} />
			</div>
		</div>
	);
}
