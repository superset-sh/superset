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
import { FaSlack } from "react-icons/fa";
import { i18n } from "@/lib/i18n-server";
import { api } from "@/trpc/server";
import { IntegrationErrorHandler } from "../components/IntegrationErrorHandler";
import { ConnectionControls } from "./components/ConnectionControls";

const CALLBACK_MESSAGES = {
	oauth_denied: i18n._({
		id: "web.integrations.callback.oauthDenied",
		message: "Authorization was denied. Please try again.",
	}),
	missing_params: i18n._({
		id: "web.integrations.callback.missingParams",
		message: "Invalid OAuth response. Please try again.",
	}),
	invalid_state: i18n._({
		id: "web.integrations.callback.invalidState",
		message: "Invalid state parameter. Please try again.",
	}),
	token_exchange_failed: i18n._({
		id: "web.integrations.slack.callback.tokenExchangeFailed",
		message: "Failed to connect to Slack. Please try again.",
	}),
	slack_api_error: i18n._({
		id: "web.integrations.slack.callback.apiError",
		message: "Slack API error occurred. Please try again.",
	}),
	unauthorized: i18n._({
		id: "web.integrations.callback.unauthorized",
		message: "You are not authorized to perform this action.",
	}),
	workspace_already_linked: {
		param: "owner",
		withParam: i18n._({
			id: "web.integrations.slack.callback.workspaceLinkedByOwner",
			message:
				"This Slack workspace is already connected by {owner}. Ask them to disconnect first.",
		}),
		withoutParam: i18n._({
			id: "web.integrations.slack.callback.workspaceLinked",
			message:
				"This Slack workspace is already connected by another Superset organization.",
		}),
	},
};

export default async function SlackIntegrationPage() {
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

	const connection = await trpc.integration.slack.getConnection.query({
		organizationId: organization.id,
	});
	const isConnected = !!connection;

	return (
		<div className="space-y-8">
			<IntegrationErrorHandler provider="slack" messages={CALLBACK_MESSAGES} />

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
					<FaSlack className="size-10" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">Slack</h1>
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
							id: "web.integrations.slack.blurb",
							message:
								"Connect Slack to manage tasks from conversations. Mention the bot in any channel or send it a direct message to create and update tasks.",
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
							id: "web.integrations.slack.connectionDescription",
							message:
								"Connect your Slack workspace to manage tasks from conversations.",
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
							<span className="font-medium">{connection.externalOrgName}</span>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
