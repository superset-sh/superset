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
import { FaGitlab } from "react-icons/fa";
import { api } from "@/trpc/server";
import { ConnectionControls } from "./components/ConnectionControls";
import { ErrorHandler } from "./components/ErrorHandler";
import { RepositoryList } from "./components/RepositoryList";

export default async function GitLabIntegrationPage() {
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

	const connection = await trpc.integration.gitlab.getConnection.query({
		organizationId: organization.id,
	});
	const isConnected = !!connection && !connection.needsReconnect;

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
					<FaGitlab className="size-10 text-[#FC6D26]" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">GitLab</h1>
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
						Connect a GitLab group and sync its merge requests. Track pipeline
						status and approvals across your team. GitLab™ is a trademark of
						GitLab Inc.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Connection</CardTitle>
					<CardDescription>
						Connect a GitLab group via OAuth (gitlab.com) or a Group Access
						Token (self-managed / any host).
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ConnectionControls
						organizationId={organization.id}
						isConnected={isConnected}
					/>
					{connection && (
						<div className="mt-4 text-sm text-muted-foreground">
							Connected to <strong>{connection.groupName}</strong>
							{connection.config?.groupPath
								? ` (${connection.config.groupPath})`
								: null}
							{connection.config?.host ? ` on ${connection.config.host}` : null}
							{connection.needsReconnect && (
								<Badge variant="destructive" className="ml-2">
									Needs reconnect
								</Badge>
							)}
						</div>
					)}
				</CardContent>
			</Card>

			{isConnected && (
				<Card>
					<CardHeader>
						<CardTitle>Projects</CardTitle>
						<CardDescription>
							Projects in the connected GitLab group and its subgroups.
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
