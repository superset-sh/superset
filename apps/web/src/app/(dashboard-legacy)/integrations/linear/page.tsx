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
import { api } from "@/trpc/server";
import {
	ConnectAnotherButton,
	ConnectInitialButton,
	ConnectionControls,
} from "./components/ConnectionControls";
import { ErrorHandler } from "./components/ErrorHandler";
import { TeamSelector } from "./components/TeamSelector";

export default async function LinearIntegrationPage() {
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

	const connections = await trpc.integration.linear.listConnections.query({
		organizationId: organization.id,
	});

	const hasAnyConnection = connections.length > 0;

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
					<SiLinear className="size-10" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">Linear</h1>
						{hasAnyConnection ? (
							<Badge variant="default" className="gap-1">
								<CheckCircle2 className="size-3" />
								{connections.length} connected
							</Badge>
						) : (
							<Badge variant="secondary">Not Connected</Badge>
						)}
					</div>
					<p className="mt-1 text-muted-foreground">
						Sync issues bidirectionally with Linear. Connect multiple Linear
						workspaces and assign each project to one.
					</p>
				</div>
				{hasAnyConnection && (
					<ConnectAnotherButton organizationId={organization.id} />
				)}
			</div>

			{!hasAnyConnection ? (
				<Card>
					<CardHeader>
						<CardTitle>Connect Linear</CardTitle>
						<CardDescription>
							Connect your first Linear workspace to start syncing issues.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ConnectInitialButton organizationId={organization.id} />
					</CardContent>
				</Card>
			) : (
				connections.map((conn) => (
					<Card key={conn.id}>
						<CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
							<div>
								<CardTitle className="flex items-center gap-2 text-base">
									{conn.externalOrgName ?? "Unnamed workspace"}
									{conn.disconnectedAt && (
										<Badge variant="destructive" className="gap-1">
											<AlertTriangle className="size-3" />
											Reconnect required
										</Badge>
									)}
								</CardTitle>
								<CardDescription className="mt-1">
									{conn.linkedProjectCount} project
									{conn.linkedProjectCount === 1 ? "" : "s"} linked
								</CardDescription>
							</div>
							<ConnectionControls
								organizationId={organization.id}
								connectionId={conn.id}
							/>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<p className="text-sm font-medium">
									Default team for new tasks
								</p>
								<TeamSelector
									connectionId={conn.id}
									organizationId={organization.id}
									currentTeamId={conn.config?.newTasksTeamId}
								/>
								<p className="text-sm text-muted-foreground">
									Tasks created in projects assigned to this workspace land in
									this Linear team.
								</p>
							</div>
						</CardContent>
					</Card>
				))
			)}
		</div>
	);
}
