import { Badge } from "@superset/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { FaGoogle } from "react-icons/fa";
import { api } from "@/trpc/server";
import { IntegrationErrorHandler } from "../components/IntegrationErrorHandler";
import { requireOfferedIntegration } from "../utils/requireOfferedIntegration";
import { ConnectionControls } from "./components/ConnectionControls";

const CALLBACK_MESSAGES = {
	oauth_denied: "Authorization was denied. Please try again.",
	missing_params: "Invalid OAuth response. Please try again.",
	invalid_state: "Invalid state parameter. Please try again.",
	token_exchange_failed: "Failed to connect to Google. Please try again.",
	missing_scopes:
		"Both Calendar and Gmail access are required. Please allow both when asked.",
	no_refresh_token:
		"Google did not grant lasting access. Remove Superset from your Google account's third-party access and try again.",
	userinfo_failed: "Could not read the Google account. Please try again.",
	unauthorized: "You are not authorized to perform this action.",
};

export default async function GoogleIntegrationPage() {
	await requireOfferedIntegration("google");
	const trpc = await api();
	const organization = await trpc.user.myOrganization.query();

	if (!organization) {
		return (
			<div className="flex flex-col items-center justify-center py-16">
				<p className="text-muted-foreground">
					You need to be part of an organization to use integrations.
				</p>
			</div>
		);
	}

	const connection = await trpc.integration.google.getConnection.query({
		organizationId: organization.id,
	});
	const isConnected = !!connection && !connection.needsReconnect;
	const needsReconnect = !!connection?.needsReconnect;

	return (
		<div className="space-y-8">
			<IntegrationErrorHandler provider="google" messages={CALLBACK_MESSAGES} />

			<Link
				href="/integrations"
				className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				Back to Integrations
			</Link>

			<div className="flex items-start gap-6">
				<div className="flex size-16 items-center justify-center rounded-xl border bg-card p-3">
					<FaGoogle className="size-10" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">Google</h1>
						{needsReconnect ? (
							<Badge variant="destructive" className="gap-1">
								<AlertTriangle className="size-3" />
								Reconnect required
							</Badge>
						) : isConnected ? (
							<Badge variant="default" className="gap-1">
								<CheckCircle2 className="size-3" />
								Connected
							</Badge>
						) : (
							<Badge variant="secondary">Not Connected</Badge>
						)}
					</div>
					<p className="mt-1 text-muted-foreground">
						Trigger automations from Google Calendar and Gmail: events created,
						updated, cancelled, starting soon or ended, and email arriving in
						the connected inbox.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Connection</CardTitle>
					<CardDescription>
						Connect a Google account. Its calendars and mailbox are read-only,
						and triggers run for the person who connected it.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ConnectionControls
						organizationId={organization.id}
						isConnected={isConnected}
						needsReconnect={needsReconnect}
					/>
					{connection?.email && (
						<div className="mt-4 text-sm text-muted-foreground">
							Connected as{" "}
							<span className="font-medium">{connection.email}</span>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
