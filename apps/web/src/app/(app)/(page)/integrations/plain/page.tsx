import { msg } from "@lingui/core/macro";
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
import { env } from "@/env";
import { initServerI18n } from "@/lib/i18n-server";
import { api } from "@/trpc/server";
import { PlainIcon } from "../components/PlainIcon";
import { PlainConnectionControls } from "./components/PlainConnectionControls";

export default async function PlainIntegrationPage() {
	const i18n = await initServerI18n();
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

	const connection = await trpc.integration.plain.getConnection.query({
		organizationId: organization.id,
	});
	const isConnected = !!connection;
	const needsReconnect = !!connection?.needsReconnect;
	const webhookUrl = `${env.NEXT_PUBLIC_API_URL}/api/integrations/plain/webhook`;

	return (
		<div className="space-y-8">
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
					<PlainIcon className="size-10" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">Plain</h1>
						{needsReconnect ? (
							<Badge variant="destructive" className="gap-1">
								<AlertTriangle className="size-3" />
								{i18n._(
									msg({
										message: "Reconnect required",
									}),
								)}
							</Badge>
						) : isConnected ? (
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
									"Sync support threads from Plain into Superset as tasks, so customer-reported work can flow straight into agent workspaces.",
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
									"Connect your Plain workspace with a machine user API key. Create one in Plain under Settings → Machine users, with the thread:read, customer:read, and labelType:read permissions.",
							}),
						)}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<PlainConnectionControls
						organizationId={organization.id}
						isConnected={isConnected}
						needsReconnect={needsReconnect}
						workspaceName={connection?.externalOrgName ?? null}
					/>
				</CardContent>
			</Card>

			{connection && (
				<Card>
					<CardHeader>
						<CardTitle>
							{i18n._(
								msg({
									message: "Webhook",
								}),
							)}
						</CardTitle>
						<CardDescription>
							{i18n._(
								msg({
									message: "Keep threads in sync as they change in Plain.",
								}),
							)}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						<p className="text-sm">
							{i18n._(
								msg({
									message:
										"In Plain, add a webhook target (Settings → Webhooks) pointing at:",
								}),
							)}
						</p>
						<code className="block w-fit rounded-md bg-muted px-3 py-2 text-sm">
							{webhookUrl}
						</code>
						<p className="text-sm text-muted-foreground">
							{i18n._(
								msg({
									message:
										"Subscribe it to the thread events, and paste your workspace's request-signing secret (Settings → Request signing) into the connection form above.",
								}),
							)}{" "}
							{connection.hasWebhookSecret
								? i18n._(
										msg({
											message: "A signing secret is configured.",
										}),
									)
								: i18n._(
										msg({
											message:
												"No signing secret is configured yet, so webhook deliveries are rejected.",
										}),
									)}
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
