import type {
	GitCommitAuthorMode,
	GithubActorPolicy,
} from "@superset/db/schema";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { SettingsRow } from "../../../../../components/SettingsRow";

const AUTHOR_MODES: Array<{ value: GitCommitAuthorMode; label: string }> = [
	{ value: "you_only", label: "You only" },
	{ value: "superset_only", label: "Superset only" },
	{
		value: "you_author_superset_committer",
		label: "You as author, Superset as committer",
	},
	{
		value: "superset_author_you_committer",
		label: "Superset as author, you as committer",
	},
];

const ACTOR_POLICIES: Array<{
	value: GithubActorPolicy;
	label: string;
	description: string;
}> = [
	{
		value: "bot",
		label: "Superset",
		description: "Always opens PRs as Superset",
	},
	{
		value: "user_or_bot",
		label: "User",
		description:
			"Opens as the user when their Git account is connected, otherwise as Superset",
	},
	{
		value: "user_only",
		label: "User only",
		description:
			"Opens as the user; fails if their Git account isn't connected. Automations and service users fall back to Superset",
	},
];

/**
 * Git identity for cloud workspaces: whose name goes on commits (per user,
 * pure git config) and whose account pushes and opens PRs (per org, the
 * token). Two different mechanisms on purpose — see resolveGitHubActor.
 */
export function CloudGitIdentitySection() {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const utils = cloudTrpc.useUtils();

	const settingsQuery = cloudTrpc.user.settings.get.useQuery();
	const emailOptionsQuery = cloudTrpc.user.settings.gitEmailOptions.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: !!organizationId },
	);
	const orgSettingsQuery = cloudTrpc.organization.settings.get.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: !!organizationId },
	);

	const updateUser = cloudTrpc.user.settings.update.useMutation({
		onSuccess: () => void utils.user.settings.get.invalidate(),
		onError: (error) => toast.error(error.message),
	});
	const updateOrg = cloudTrpc.organization.settings.update.useMutation({
		onSuccess: () => {
			if (organizationId) {
				void utils.organization.settings.get.invalidate({ organizationId });
			}
		},
		onError: (error) => toast.error(error.message),
	});

	const authorMode = settingsQuery.data?.gitCommitAuthorMode ?? "you_only";
	const accountEmail = session?.user?.email ?? null;
	const chosenEmail =
		settingsQuery.data?.gitCommitEmail ?? accountEmail ?? undefined;
	const emailOptions = emailOptionsQuery.data ?? [];
	const policy = orgSettingsQuery.data?.githubActorPolicy ?? "user_or_bot";
	const canEditPolicy = orgSettingsQuery.data?.canEdit ?? false;

	return (
		<section className="mt-8">
			<h3 className="mb-1 text-sm font-semibold">Cloud workspaces</h3>
			<p className="mb-2 text-xs text-muted-foreground">
				Identity for commits and pull requests made in cloud workspaces.
			</p>
			<SettingsRow
				label="Git commit author"
				hint="Set a git author and committer for cloud workspace commits"
			>
				<Select
					value={authorMode}
					disabled={settingsQuery.isLoading || updateUser.isPending}
					onValueChange={(next) =>
						updateUser.mutate({
							gitCommitAuthorMode: next as GitCommitAuthorMode,
						})
					}
				>
					<SelectTrigger className="w-64">
						<SelectValue>
							{AUTHOR_MODES.find((mode) => mode.value === authorMode)?.label}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{AUTHOR_MODES.map((mode) => (
							<SelectItem key={mode.value} value={mode.value}>
								{mode.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</SettingsRow>
			<SettingsRow
				label="Git commit email"
				hint="Set an email to use for git commits"
			>
				<Select
					value={chosenEmail}
					disabled={settingsQuery.isLoading || updateUser.isPending}
					onValueChange={(next) =>
						updateUser.mutate({
							// The account email is the automatic default; storing null
							// keeps it following the account if that ever changes.
							gitCommitEmail: next === accountEmail ? null : next,
						})
					}
				>
					<SelectTrigger className="w-64">
						<SelectValue>{chosenEmail}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{emailOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
						{chosenEmail &&
							!emailOptions.some((option) => option.value === chosenEmail) && (
								<SelectItem value={chosenEmail}>{chosenEmail}</SelectItem>
							)}
					</SelectContent>
				</Select>
			</SettingsRow>
			<SettingsRow
				label="Open PRs as"
				hint={
					canEditPolicy
						? "Author identity for Superset-created PRs"
						: "Author identity for Superset-created PRs. Only organization admins can change this."
				}
			>
				<Select
					value={policy}
					disabled={
						!canEditPolicy || orgSettingsQuery.isLoading || updateOrg.isPending
					}
					onValueChange={(next) => {
						if (!organizationId) return;
						updateOrg.mutate({
							organizationId,
							githubActorPolicy: next as GithubActorPolicy,
						});
					}}
				>
					<SelectTrigger className="w-64">
						<SelectValue>
							{ACTOR_POLICIES.find((option) => option.value === policy)?.label}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{ACTOR_POLICIES.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								<div className="flex flex-col items-start gap-0.5">
									<span>{option.label}</span>
									<span className="max-w-sm whitespace-normal text-xs text-muted-foreground">
										{option.description}
									</span>
								</div>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</SettingsRow>
		</section>
	);
}
