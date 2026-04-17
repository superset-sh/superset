import { Button } from "@superset/ui/button";
import { TRPCClientError } from "@trpc/client";
import { Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
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
							Invitation link does not exist
						</h1>
						<p className="text-muted-foreground">
							The team invitation has either expired or doesn't exist. Request a
							new link from the team owner or check the URL to make sure it is
							entered correctly.
						</p>
					</div>
					<Button asChild variant="outline">
						<Link href="/">Return to dashboard</Link>
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
						<Image
							src={invitation.organization.logo}
							alt={invitation.organization.name}
							fill
							className="rounded-lg object-contain"
						/>
					</div>
				)}

				<div className="space-y-4">
					<h1 className="text-2xl font-semibold">
						You've been invited to join {invitation.organization.name}
					</h1>
					<p className="text-muted-foreground">
						{invitation.inviter.name} invited you to join as a {invitation.role}
						.
					</p>
				</div>

				<AcceptInvitationButton invitationId={invitationId} token={token} />
			</div>
		</div>
	);
}
