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
import { i18n } from "@/lib/i18n-server";
import { api } from "@/trpc/server";
import { IntegrationErrorHandler } from "../components/IntegrationErrorHandler";
import { requireOfferedIntegration } from "../utils/requireOfferedIntegration";
import { ConnectionControls } from "./components/ConnectionControls";

const CALLBACK_MESSAGES = {
	not_configured: i18n._({
		id: "web.integrations.sentry.callback.notConfigured",
		message:
			"Sentry isn't available yet — the Superset app hasn't been registered with Sentry.",
	}),
	oauth_denied: i18n._({
		id: "web.integrations.sentry.callback.oauthDenied",
		message: "The install was cancelled. Please try again.",
	}),
	missing_params: i18n._({
		id: "web.integrations.sentry.callback.missingParams",
		message: "Invalid response from Sentry. Please try again.",
	}),
	invalid_state: i18n._({
		id: "web.integrations.sentry.callback.invalidState",
		message: "Your session expired. Start the connection again.",
	}),
	unauthorized: i18n._({
		id: "web.integrations.callback.unauthorized",
		message: "You are not authorized to perform this action.",
	}),
	token_exchange_failed: i18n._({
		id: "web.integrations.sentry.callback.tokenExchangeFailed",
		message: "Failed to complete the Sentry install. Please try again.",
	}),
	organization_lookup_failed: i18n._({
		id: "web.integrations.sentry.callback.organizationLookupFailed",
		message:
			"Connected, but couldn't read your Sentry organization. Please reconnect.",
	}),
};

export default async function SentryIntegrationPage() {
	await requireOfferedIntegration("sentry");
	const trpc = await api();
	const organization = await trpc.user.myOrganization.query();

	if (!organization) {
		return (
			<div className="flex flex-col items-center justify-center py-16">
				<p className="text-muted-foreground">
					{i18n._({
						id: "web.integrations.needOrganization",
						message:
							"You need to be part of an organization to use integrations.",
					})}
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
				{i18n._({
					id: "web.integrations.back",
					message: "Back to Integrations",
				})}
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
								{i18n._({
									id: "web.integrations.connected",
									message: "Connected",
								})}
							</Badge>
						) : (
							<Badge variant="secondary">
								{i18n._({
									id: "web.integrations.notConnected",
									message: "Not Connected",
								})}
							</Badge>
						)}
					</div>
					<p className="mt-1 text-muted-foreground">
						{i18n._({
							id: "web.integrations.sentry.blurb",
							message:
								"Connect Sentry to run automations when issues are created, resolved, assigned, archived or unresolved.",
						})}
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>
						{i18n._({
							id: "web.integrations.connectionCard",
							message: "Connection",
						})}
					</CardTitle>
					<CardDescription>
						{i18n._({
							id: "web.integrations.sentry.connectionDescription",
							message: "Install the Superset app in your Sentry organization.",
						})}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ConnectionControls
						organizationId={organization.id}
						isConnected={isConnected}
					/>
					{connection && (
						<div className="mt-4 text-sm text-muted-foreground">
							{i18n._({
								id: "web.integrations.connectedTo",
								message: "Connected to",
							})}{" "}
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
