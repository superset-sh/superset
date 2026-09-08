import { msg } from "@lingui/core/macro";
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
import { BsMicrosoftTeams } from "react-icons/bs";
import { i18n } from "@/lib/i18n-server";
import { api } from "@/trpc/server";
import {
	type CallbackMessage,
	IntegrationErrorHandler,
} from "../components/IntegrationErrorHandler";
import { requireOfferedIntegration } from "../utils/requireOfferedIntegration";
import { ConnectionControls } from "./components/ConnectionControls";

// Graph's own words are the useful part of a refused subscription — they name
// the missing permission or the protected-API approval.
function withDetail(text: string): CallbackMessage {
	return { param: "detail", withParam: `${text} {detail}`, withoutParam: text };
}

const CALLBACK_MESSAGES = {
	oauth_denied: i18n._(
		msg({
			message:
				"Consent was not granted. A tenant administrator has to approve.",
		}),
	),
	missing_params: i18n._(
		msg({
			message: "Invalid consent response. Please try again.",
		}),
	),
	invalid_state: i18n._(
		msg({
			message: "Invalid state parameter. Please try again.",
		}),
	),
	token_exchange_failed: withDetail(
		i18n._(
			msg({
				message:
					"Consent finished but Microsoft did not issue a token for the tenant.",
			}),
		),
	),
	subscription_failed: withDetail(
		i18n._(
			msg({
				message:
					"Connected, but Microsoft Graph refused the notification subscriptions.",
			}),
		),
	),
	tenant_already_linked: {
		param: "detail",
		withParam: i18n._(
			msg({
				message:
					"This Microsoft tenant is already connected by {detail}. Ask them to disconnect first.",
			}),
		),
		withoutParam: i18n._(
			msg({
				message:
					"This Microsoft tenant is already connected by another Superset organization.",
			}),
		),
	},
	identity_denied: i18n._(
		msg({
			message:
				'Connected. Sign-in was cancelled, so triggers by "Me" will not match your Teams account until you reconnect.',
		}),
	),
	identity_failed: i18n._(
		msg({
			message:
				'Connected, but your Microsoft account could not be linked. Triggers by "Me" will not match until you reconnect.',
		}),
	),
	unauthorized: i18n._(
		msg({
			message: "You are not authorized to perform this action.",
		}),
	),
};

export default async function MicrosoftTeamsIntegrationPage() {
	await requireOfferedIntegration("microsoft_teams");
	const trpc = await api();
	const organization = await trpc.user.myOrganization.query();

	if (!organization) {
		return (
			<div className="flex flex-col items-center justify-center py-16">
				<p className="text-muted-foreground">
					{i18n._(
						msg({
							message:
								"You need to be part of an organization to use integrations.",
						}),
					)}
				</p>
			</div>
		);
	}

	const connection = await trpc.integration.microsoftTeams.getConnection.query({
		organizationId: organization.id,
	});
	const isConnected = !!connection;
	const listening =
		!!connection?.subscriptions.channelMessages &&
		!!connection?.subscriptions.channels;

	return (
		<div className="space-y-8">
			<IntegrationErrorHandler
				provider="microsoft-teams"
				messages={CALLBACK_MESSAGES}
			/>

			<Link
				href="/integrations"
				className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				{i18n._(
					msg({
						message: "Back to Integrations",
					}),
				)}
			</Link>

			<div className="flex items-start gap-6">
				<div className="flex size-16 items-center justify-center rounded-xl border bg-card p-3">
					<BsMicrosoftTeams className="size-10" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">Microsoft Teams</h1>
						{isConnected ? (
							<Badge variant="default" className="gap-1">
								<CheckCircle2 className="size-3" />
								{i18n._(
									msg({
										message: "Connected",
									}),
								)}
							</Badge>
						) : (
							<Badge variant="secondary">
								{i18n._(
									msg({
										message: "Not Connected",
									}),
								)}
							</Badge>
						)}
					</div>
					<p className="mt-1 text-muted-foreground">
						{i18n._(
							msg({
								message:
									"Run automations when messages are posted or channels are created in your Microsoft Teams tenant. Connecting requires a tenant administrator, who grants the app permission to read channel messages and channels across the tenant.",
							}),
						)}
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>
						{i18n._(
							msg({
								message: "Connection",
							}),
						)}
					</CardTitle>
					<CardDescription>
						{i18n._(
							msg({
								message:
									"Connect your Microsoft Teams tenant. A tenant admin signs in and grants consent once for the whole tenant.",
							}),
						)}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ConnectionControls
						organizationId={organization.id}
						isConnected={isConnected}
					/>
					{connection && (
						<div className="mt-4 space-y-1 text-sm text-muted-foreground">
							<p>
								{i18n._(
									msg({
										message: "Connected to",
									}),
								)}{" "}
								<span className="font-medium">
									{connection.externalOrgName ?? connection.tenantId}
								</span>
							</p>
							<p>
								{listening
									? i18n._(
											msg({
												message:
													"Listening for channel messages and new channels.",
											}),
										)
									: i18n._(
											msg({
												message:
													"Not receiving events yet: Microsoft Graph refused the notification subscriptions. Check the app's admin consent and protected API approval, then reconnect.",
											}),
										)}
							</p>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
