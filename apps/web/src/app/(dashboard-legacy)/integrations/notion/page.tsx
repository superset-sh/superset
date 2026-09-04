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
import { SiNotion } from "react-icons/si";
import { i18n } from "@/lib/i18n-server";
import { api } from "@/trpc/server";
import { IntegrationErrorHandler } from "../components/IntegrationErrorHandler";
import { requireOfferedIntegration } from "../utils/requireOfferedIntegration";
import { ConnectionControls } from "./components/ConnectionControls";

const CALLBACK_MESSAGES = {
	oauth_denied: i18n._(
		msg({
			message: "Authorization was denied. Please try again.",
		}),
	),
	missing_params: i18n._(
		msg({
			message: "Invalid OAuth response. Please try again.",
		}),
	),
	invalid_state: i18n._(
		msg({
			message: "Invalid state parameter. Please try again.",
		}),
	),
	token_exchange_failed: i18n._(
		msg({
			message: "Failed to connect to Notion. Please try again.",
		}),
	),
	not_configured: i18n._(
		msg({
			message: "Notion is not configured for this environment.",
		}),
	),
	unauthorized: i18n._(
		msg({
			message: "You are not authorized to perform this action.",
		}),
	),
};

export default async function NotionIntegrationPage() {
	await requireOfferedIntegration("notion");
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

	const connection = await trpc.integration.notion.getConnection.query({
		organizationId: organization.id,
	});
	const isConnected = !!connection;

	return (
		<div className="space-y-8">
			<IntegrationErrorHandler provider="notion" messages={CALLBACK_MESSAGES} />

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
					<SiNotion className="size-10" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">Notion</h1>
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
									"Connect Notion to run automations when rows change in a data source or someone comments on a page.",
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
									"Connect your Notion workspace and share the pages and data sources automations should watch.",
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
						<div className="mt-4 text-sm text-muted-foreground">
							{i18n._(
								msg({
									message: "Connected to",
								}),
							)}{" "}
							<span className="font-medium">{connection.externalOrgName}</span>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
