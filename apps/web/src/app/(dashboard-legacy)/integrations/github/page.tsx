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
import { api } from "@/trpc/server";
import { IntegrationErrorHandler } from "../components/IntegrationErrorHandler";
import { ConnectionControls } from "./components/ConnectionControls";
import { RepositoryList } from "./components/RepositoryList";
import { UserConnectionControls } from "./components/UserConnectionControls";

const CALLBACK_MESSAGES = {
	installation_cancelled: "GitHub App installation was cancelled.",
	missing_params: "Invalid installation response. Please try again.",
	invalid_state: "Invalid state parameter. Please try again.",
	installation_fetch_failed:
		"Failed to fetch installation details. Please try again.",
	save_failed: "Failed to save installation. Please try again.",
	already_connected:
		"This GitHub installation is already connected to another Superset organization. Disconnect it there, or uninstall the Superset GitHub App, then try again.",
	unauthorized: "You are not authorized to perform this action.",
	unexpected: "Something went wrong. Please try again.",
	// Account connection (the App's user authorization).
	not_configured: "Connecting a GitHub account isn't set up on this server.",
	oauth_denied: "GitHub authorization was cancelled.",
	token_exchange_failed:
		"GitHub didn't accept the authorization. Please try again.",
	userinfo_failed: "Couldn't read your GitHub account. Please try again.",
};

const CALLBACK_WARNINGS = {
	sync_queue_failed:
		"GitHub connected, but initial sync failed to start. Please try reconnecting.",
};

const CALLBACK_SUCCESSES = {
	github_installed: "GitHub App installed successfully!",
};

export default async function GitHubIntegrationPage() {
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

	const [installation, userConnection] = await Promise.all([
		trpc.integration.github.getInstallation.query({
			organizationId: organization.id,
		}),
		trpc.integration.github.getUserConnection.query({
			organizationId: organization.id,
		}),
	]);
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
				Back to Integrations
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
								Connected
							</Badge>
						) : (
							<Badge variant="secondary">Not Connected</Badge>
						)}
					</div>
					<p className="mt-1 text-muted-foreground">
						Connect your GitHub repositories and sync pull requests. Track CI
						status and reviews across your team.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Connection</CardTitle>
					<CardDescription>
						Install the Superset GitHub App to connect your repositories.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ConnectionControls
						organizationId={organization.id}
						isConnected={isConnected}
					/>
					{installation && (
						<div className="mt-4 text-sm text-muted-foreground">
							Connected to <strong>{installation.accountLogin}</strong> (
							{installation.accountType})
							{installation.suspended && (
								<Badge variant="destructive" className="ml-2">
									Suspended
								</Badge>
							)}
						</div>
					)}
				</CardContent>
			</Card>

			{userConnection.available && (
				<Card>
					<CardHeader>
						<CardTitle>Your GitHub account</CardTitle>
						<CardDescription>
							Connect your own account so pushes and pull requests made from
							Superset are yours, not the app's. Commits are authored as you
							either way.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<UserConnectionControls
							organizationId={organization.id}
							isConnected={!!userConnection.connection}
							needsReconnect={
								userConnection.connection?.needsReconnect ?? false
							}
						/>
						{userConnection.connection?.login && (
							<div className="mt-4 text-sm text-muted-foreground">
								Connected as <strong>@{userConnection.connection.login}</strong>
								{userConnection.connection.needsReconnect && (
									<Badge variant="destructive" className="ml-2">
										Needs reconnect
									</Badge>
								)}
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{installation && (
				<Card>
					<CardHeader>
						<CardTitle>Repositories</CardTitle>
						<CardDescription>
							Repositories accessible through the GitHub App installation.
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
