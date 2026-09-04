import { Badge } from "@superset/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { SiSentry } from "react-icons/si";
import { api } from "@/trpc/server";
import { IntegrationErrorHandler } from "../components/IntegrationErrorHandler";
import { requireOfferedIntegration } from "../utils/requireOfferedIntegration";
import { ConnectionControls } from "./components/ConnectionControls";

/**
 * Sentry records the installation the moment the admin accepts it, and refuses
 * to install it twice — so every failure after that point leaves the app
 * installed in Sentry but unlinked here, and the install page's button greyed
 * out. Superset cannot clear it (an installation token is refused a DELETE on
 * its own installation), so the messages for those failures have to say what
 * the only way back is.
 */
const RECONNECT = "Uninstall Superset in Sentry, then connect again.";

const CALLBACK_MESSAGES = {
	not_configured:
		"Sentry isn't available yet — the Superset app hasn't been registered with Sentry.",
	oauth_denied: "The install was cancelled. Please try again.",
	missing_params: `Invalid response from Sentry. ${RECONNECT}`,
	invalid_state: `Your session expired. ${RECONNECT}`,
	unauthorized: "You are not authorized to perform this action.",
	token_exchange_failed: `Couldn't finish the Sentry install. ${RECONNECT}`,
	organization_lookup_failed: `Couldn't read your Sentry organization. ${RECONNECT}`,
	organization_already_linked: {
		param: "owner",
		withParam:
			"This Sentry organization is already connected by {owner}. Ask them to disconnect first.",
		withoutParam:
			"This Sentry organization is already connected by another Superset organization.",
	},
};

export default async function SentryIntegrationPage() {
	await requireOfferedIntegration("sentry");
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

	const connection = await trpc.integration.sentry.getConnection.query({
		organizationId: organization.id,
	});
	const isConnected = !!connection;

	return (
		<div className="space-y-8">
			<IntegrationErrorHandler provider="sentry" messages={CALLBACK_MESSAGES} />

			<Link
				href="/integrations"
				className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				Back to Integrations
			</Link>

			<div className="flex items-start gap-6">
				<div className="flex size-16 items-center justify-center rounded-xl border bg-card p-3">
					<SiSentry className="size-10" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">Sentry</h1>
						{isConnected ? (
							<Badge variant="default" className="gap-1">
								<CheckCircle2 className="size-3" />
								Connected
							</Badge>
						) : (
							<Badge variant="secondary">Not Connected</Badge>
						)}
					</div>
					<p className="mt-1 text-muted-foreground">
						Connect Sentry to run automations when issues are created, resolved,
						assigned, archived or unresolved.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Connection</CardTitle>
					<CardDescription>
						Install the Superset app in your Sentry organization.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ConnectionControls
						organizationId={organization.id}
						isConnected={isConnected}
					/>
					{connection && (
						<div className="mt-4 text-sm text-muted-foreground">
							Connected to{" "}
							<span className="font-medium">
								{connection.organizationName ?? connection.organizationSlug}
							</span>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
