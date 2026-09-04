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
import { SiLinear } from "react-icons/si";
import { i18n } from "@/lib/i18n-server";
import { api } from "@/trpc/server";
import { IntegrationErrorHandler } from "../components/IntegrationErrorHandler";
import { ConnectionControls } from "./components/ConnectionControls";
import { TeamSelector } from "./components/TeamSelector";

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
			message: "Failed to connect to Linear. Please try again.",
		}),
	),
	unauthorized: i18n._(
		msg({
			message: "You are not authorized to perform this action.",
		}),
	),
};

const CALLBACK_WARNINGS = {
	sync_queued_failed: i18n._(
		msg({
			message:
				"Linear connected, but initial sync failed to start. Please try reconnecting.",
		}),
	),
};

export default async function LinearIntegrationPage() {
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

	const connection = await trpc.integration.linear.getConnection.query({
		organizationId: organization.id,
	});
	const isConnected = !!connection;
	const needsReconnect = !!connection?.needsReconnect;

	return (
		<div className="space-y-8">
			<IntegrationErrorHandler
				provider="linear"
				messages={CALLBACK_MESSAGES}
				warnings={CALLBACK_WARNINGS}
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
					<SiLinear className="size-10" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">Linear</h1>
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
									"Sync issues bidirectionally with Linear. Create tasks in Superset and have them appear in Linear, or import existing Linear issues.",
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
									"Connect your Linear workspace to sync issues bidirectionally.",
							}),
						)}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ConnectionControls
						organizationId={organization.id}
						isConnected={isConnected}
						needsReconnect={needsReconnect}
					/>
				</CardContent>
			</Card>

			{connection && (
				<Card>
					<CardHeader>
						<CardTitle>
							{i18n._(
								msg({
									message: "Settings",
								}),
							)}
						</CardTitle>
						<CardDescription>
							{i18n._(
								msg({
									message:
										"Configure how tasks sync between Superset and Linear.",
								}),
							)}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<p className="text-sm font-medium">
								{i18n._(
									msg({
										message: "Default team for new tasks",
									}),
								)}
							</p>
							<TeamSelector organizationId={organization.id} />
							<p className="text-sm text-muted-foreground">
								{i18n._(
									msg({
										message:
											"Tasks created in Superset will be synced to this Linear team.",
									}),
								)}
							</p>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
