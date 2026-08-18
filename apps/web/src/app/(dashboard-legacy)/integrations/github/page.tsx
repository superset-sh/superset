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
import { ConnectionControls } from "./components/ConnectionControls";
import { ErrorHandler } from "./components/ErrorHandler";
import { RepositoryList } from "./components/RepositoryList";
import { UserConnectionControls } from "./components/UserConnectionControls";

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
			<ErrorHandler />

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
