import { msg } from "@lingui/core/macro";
import { findOrgMembership } from "@superset/db/utils";
import { readGitlabConfig } from "@superset/trpc/lib/gitlab/config";
import { gitlabConnectionForOrg } from "@superset/trpc/lib/gitlab/connection";
import { trustedGitLabOrigin } from "@superset/trpc/lib/gitlab/ssrf";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@superset/ui/card";
import Link from "next/link";
import { FaGitlab } from "react-icons/fa";
import { env } from "@/env";
import { initServerI18n } from "@/lib/i18n-server";
import { api } from "@/trpc/server";
import { GitLabConnectionForm } from "./components/GitLabConnectionForm";
import { gitlabErrorMessage } from "./utils/gitlab-feedback";

type SearchParams = Record<string, string | string[] | undefined>;
export default async function GitLabIntegrationPage({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
	const i18n = await initServerI18n();
	const params = await searchParams;
	const trpc = await api();
	const requestedOrg =
		typeof params.organizationId === "string"
			? params.organizationId
			: undefined;
	const organization = requestedOrg
		? (await trpc.user.myOrganizations.query()).find(
				(org) => org.id === requestedOrg,
			)
		: await trpc.user.myOrganization.query();
	if (!organization)
		return (
			<p className="py-16 text-muted-foreground">
				{i18n._(
					requestedOrg
						? msg({
								message:
									"You are not authorized to manage this organization's integrations.",
							})
						: msg({
								message:
									"You need to be part of an organization to use integrations.",
							}),
				)}
			</p>
		);
	const user = await trpc.user.me.query();
	const membership = await findOrgMembership({
		userId: user.id,
		organizationId: organization.id,
	});
	if (!membership)
		return (
			<p className="py-16 text-muted-foreground">
				{i18n._(
					msg({
						message:
							"You are not authorized to manage this organization's integrations.",
					}),
				)}
			</p>
		);
	const canManage = membership.role === "admin" || membership.role === "owner";
	let loadFailed = false;
	const snapshot = await Promise.all([
		trpc.integration.connectionStatus.query({
			organizationId: organization.id,
		}),
		gitlabConnectionForOrg(organization.id, { includeDisconnected: true }),
	]).catch(() => {
		loadFailed = true;
		return null;
	});
	const status = snapshot?.[0].gitlab;
	const stored = snapshot?.[1];
	const config = readGitlabConfig(stored?.state);
	const isConnected = status?.connected === true && !status.needsReauth;
	const needsReauth = status?.needsReauth === true;
	const oauthOrigin = process.env.GITLAB_ISSUER
		? trustedGitLabOrigin()
		: "https://gitlab.com";
	const oauthHost = oauthOrigin ? new URL(oauthOrigin).host : null;
	const actionUrl = (action: "hook" | "disconnect") => {
		const url = new URL(`/api/gitlab/${action}`, env.NEXT_PUBLIC_API_URL);
		url.searchParams.set("organizationId", organization.id);
		return url.href;
	};
	const form = (
		<GitLabConnectionForm
			i18n={i18n}
			apiUrl={env.NEXT_PUBLIC_API_URL}
			organizationId={organization.id}
			oauthHost={oauthHost}
			tokenHost={config?.host ?? oauthHost ?? "gitlab.com"}
			groupPath={config?.groupPath ?? ""}
			disabled={!canManage || loadFailed}
		/>
	);
	return (
		<div className="space-y-8">
			<Link href="/integrations" className="text-sm text-muted-foreground">
				{i18n._(msg({ message: "Back to Integrations" }))}
			</Link>
			<div className="flex items-center gap-3">
				<FaGitlab className="size-10 text-orange-500" />
				<h1 className="text-2xl font-semibold">GitLab</h1>
				<Badge variant={isConnected ? "default" : "secondary"}>
					{i18n._(
						loadFailed
							? msg({ message: "Could not load connection status." })
							: needsReauth
								? msg({ message: "Reconnect required" })
								: isConnected
									? msg({ message: "Connected" })
									: msg({ message: "Not connected" }),
					)}
				</Badge>
			</div>
			<p className="text-muted-foreground">
				{i18n._(
					msg({
						message:
							"Connect a GitLab project or group, including self-managed instances and nested subgroups.",
					}),
				)}
			</p>
			<p className="text-sm text-muted-foreground">{organization.name}</p>
			{typeof params.error === "string" && (
				<p role="alert" className="text-sm text-destructive">
					{i18n._(gitlabErrorMessage(params.error))}
				</p>
			)}
			{!canManage && (
				<p className="text-sm text-muted-foreground">
					{i18n._(
						msg({
							message:
								"Only organization admins and owners can manage this connection.",
						}),
					)}
				</p>
			)}
			{needsReauth && (
				<p role="alert" className="text-sm text-muted-foreground">
					{i18n._(
						msg({
							message:
								"Reconnect GitLab to restore access and webhook delivery.",
						}),
					)}
				</p>
			)}
			<Card>
				<CardHeader>
					<CardTitle>{i18n._(msg({ message: "Connection" }))}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					{isConnected && config ? (
						<>
							<dl className="grid gap-2 text-sm">
								<dt>{i18n._(msg({ message: "GitLab host" }))}</dt>
								<dd>{config.host}</dd>
								<dt>{i18n._(msg({ message: "Project or group path" }))}</dt>
								<dd>{config.groupPath}</dd>
							</dl>
							<div className="flex flex-wrap gap-3">
								<form method="post" action={actionUrl("hook")}>
									<fieldset disabled={!canManage || loadFailed}>
										<Button type="submit" variant="outline">
											{i18n._(msg({ message: "Refresh webhooks" }))}
										</Button>
									</fieldset>
								</form>
								<form method="post" action={actionUrl("disconnect")}>
									<fieldset disabled={!canManage || loadFailed}>
										<Button type="submit" variant="destructive">
											{i18n._(msg({ message: "Disconnect" }))}
										</Button>
									</fieldset>
								</form>
							</div>
							<details>
								<summary className="cursor-pointer text-sm">
									{i18n._(msg({ message: "Change connection" }))}
								</summary>
								<div className="mt-4">{form}</div>
							</details>
						</>
					) : (
						<div className="space-y-6">
							{form}
							{needsReauth && stored && (
								<form method="post" action={actionUrl("disconnect")}>
									<fieldset disabled={!canManage || loadFailed}>
										<Button type="submit" variant="destructive">
											{i18n._(msg({ message: "Disconnect" }))}
										</Button>
									</fieldset>
								</form>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
