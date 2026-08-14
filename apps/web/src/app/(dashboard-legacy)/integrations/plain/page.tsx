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
import { HiOutlineChatBubbleLeftRight } from "react-icons/hi2";
import { env } from "@/env";
import { api } from "@/trpc/server";
import { PlainConnectionControls } from "./components/PlainConnectionControls";

export default async function PlainIntegrationPage() {
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
				Back to Integrations
			</Link>

			<div className="flex items-start gap-6">
				<div className="flex size-16 items-center justify-center rounded-xl border bg-card p-3">
					<HiOutlineChatBubbleLeftRight className="size-10" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">Plain</h1>
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
						Sync support threads from Plain into Superset as tasks, so
						customer-reported work can flow straight into agent workspaces.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Connection</CardTitle>
					<CardDescription>
						Connect your Plain workspace with a machine user API key. Create one
						in Plain under Settings → Machine users, with the thread:read,
						customer:read, and labelType:read permissions.
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
						<CardTitle>Webhook</CardTitle>
						<CardDescription>
							Keep threads in sync as they change in Plain.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						<p className="text-sm">
							In Plain, add a webhook target (Settings → Webhooks) pointing at:
						</p>
						<code className="block w-fit rounded-md bg-muted px-3 py-2 text-sm">
							{webhookUrl}
						</code>
						<p className="text-sm text-muted-foreground">
							Subscribe it to the thread events, and paste your workspace's
							request-signing secret (Settings → Request signing) into the
							connection form above.{" "}
							{connection.hasWebhookSecret
								? "A signing secret is configured."
								: "No signing secret is configured yet, so webhook deliveries are rejected."}
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
