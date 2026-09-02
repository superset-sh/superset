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
import { FaGithub } from "react-icons/fa";
import { i18n } from "@/lib/i18n-server";
import { api } from "@/trpc/server";
import { IntegrationErrorHandler } from "../components/IntegrationErrorHandler";
import { ConnectionControls } from "./components/ConnectionControls";
import { RepositoryList } from "./components/RepositoryList";

const CALLBACK_MESSAGES = {
	installation_cancelled: i18n._(
		msg({
			message: "GitHub App installation was cancelled.",
		}),
	),
	missing_params: i18n._(
		msg({
			message: "Invalid installation response. Please try again.",
		}),
	),
	invalid_state: i18n._(
		msg({
			message: "Invalid state parameter. Please try again.",
		}),
	),
	installation_fetch_failed: i18n._(
		msg({
			message: "Failed to fetch installation details. Please try again.",
		}),
	),
	save_failed: i18n._(
		msg({
			message: "Failed to save installation. Please try again.",
		}),
	),
	already_connected: i18n._(
		msg({
			message:
				"This GitHub installation is already connected to another Superset organization. Disconnect it there, or uninstall the Superset GitHub App, then try again.",
		}),
	),
	unauthorized: i18n._(
		msg({
			message: "You are not authorized to perform this action.",
		}),
	),
	unexpected: i18n._(
		msg({
			message: "Something went wrong. Please try again.",
		}),
	),
};

const CALLBACK_WARNINGS = {
	sync_queue_failed: i18n._(
		msg({
			message:
				"GitHub connected, but initial sync failed to start. Please try reconnecting.",
		}),
	),
};

const CALLBACK_SUCCESSES = {
	github_installed: i18n._(
		msg({
			message: "GitHub App installed successfully!",
		}),
	),
};

export default async function GitHubIntegrationPage() {
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

	const installation = await trpc.integration.github.getInstallation.query({
		organizationId: organization.id,
	});
	const isConnected = !!installation;

	return (
		<div className="space-y-8">
			<IntegrationErrorHandler
				provider="github"
				messages={CALLBACK_MESSAGES}
				warnings={CALLBACK_WARNINGS}
				successes={CALLBACK_SUCCESSES}
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
					<FaGithub className="size-10" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">GitHub</h1>
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
									"Connect your GitHub repositories and sync pull requests. Track CI status and reviews across your team.",
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
									"Install the Superset GitHub App to connect your repositories.",
							}),
						)}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ConnectionControls
						organizationId={organization.id}
						isConnected={isConnected}
					/>
					{installation && (
						<div className="mt-4 text-sm text-muted-foreground">
							{i18n._(
								msg({
									message: "Connected to",
								}),
							)}{" "}
							<strong>{installation.accountLogin}</strong> (
							{installation.accountType})
							{installation.suspended && (
								<Badge variant="destructive" className="ml-2">
									{i18n._(
										msg({
											message: "Suspended",
										}),
									)}
								</Badge>
							)}
						</div>
					)}
				</CardContent>
			</Card>

			{installation && (
				<Card>
					<CardHeader>
						<CardTitle>
							{i18n._(
								msg({
									message: "Repositories",
								}),
							)}
						</CardTitle>
						<CardDescription>
							{i18n._(
								msg({
									message:
										"Repositories accessible through the GitHub App installation.",
								}),
							)}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<RepositoryList organizationId={organization.id} />
					</CardContent>
				</Card>
			)}
		</div>
	);
}
