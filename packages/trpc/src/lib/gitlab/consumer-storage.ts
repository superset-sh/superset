import type { cloudWorkspaces, environments } from "@superset/db/schema";
import { executeRows } from "@superset/db/utils";
import { sql } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { GitlabCloneError, resolveGitlabClone } from "./checkout";
import type { GitlabExecutor } from "./checkout-storage";
import type { GitlabCheckout } from "./types";

export async function resolveGitlabConsumerProject(args: {
	organizationId: string;
	cloneUrl: string;
}) {
	try {
		return await resolveGitlabClone(args);
	} catch (error) {
		if (!(error instanceof GitlabCloneError)) throw error;
		throw userError({
			code: "BAD_REQUEST",
			message: error.message,
			i18nKey:
				error.reason === "project"
					? "serverError.cloudWorkspace.gitlabProjectNotFound"
					: error.reason === "host"
						? "serverError.cloudWorkspace.gitlabHostMismatch"
						: "serverError.cloudWorkspace.reconnectGitLab",
		});
	}
}

export async function lockGitlabConsumerEnvironment(
	executor: GitlabExecutor,
	args: {
		environment: Pick<
			typeof environments.$inferSelect,
			| "id"
			| "organizationId"
			| "scope"
			| "createdByUserId"
			| "sourceKind"
			| "sourceRef"
		>;
		organizationId: string;
		userId: string;
	},
): Promise<void> {
	const e = args.environment;
	const rows = executeRows(
		await executor.execute(sql`SELECT id FROM environments
 WHERE id = ${e.id}::uuid AND organization_id = ${args.organizationId}::uuid AND organization_id = ${e.organizationId}::uuid
 AND archived_at IS NULL AND (scope <> 'personal' OR created_by_user_id = ${args.userId}::uuid)
 AND scope = ${e.scope} AND created_by_user_id IS NOT DISTINCT FROM ${e.createdByUserId}::uuid
 AND source_kind = ${e.sourceKind} AND source_ref = ${e.sourceRef} FOR UPDATE`),
	);
	if (!rows.length)
		throw userError({
			code: "NOT_FOUND",
			message: "Environment not found in this organization",
			i18nKey: "serverError.cloudWorkspace.environmentNotFound",
		});
}

export async function lockGitlabConsumerWorkspace(
	executor: GitlabExecutor,
	args: {
		workspace: Pick<
			typeof cloudWorkspaces.$inferSelect,
			| "id"
			| "organizationId"
			| "environmentId"
			| "baseBranch"
			| "branch"
			| "providerSandboxId"
		>;
		userId: string;
	},
): Promise<void> {
	const w = args.workspace;
	const rows = executeRows(
		await executor.execute(sql`SELECT id FROM cloud_workspaces
 WHERE id = ${w.id}::uuid AND organization_id = ${w.organizationId}::uuid AND status = 'ready'
 AND (visibility = 'org' OR created_by_user_id = ${args.userId}::uuid)
 AND environment_id = ${w.environmentId}::uuid AND base_branch = ${w.baseBranch} AND branch = ${w.branch}
 AND provider_sandbox_id = ${w.providerSandboxId} FOR UPDATE`),
	);
	if (!rows.length)
		throw userError({
			code: "NOT_FOUND",
			message: "Not found",
			i18nKey: "serverError.cloudWorkspace.notFound",
		});
}

export function requireSameGitlabConsumerBinding(
	expected: GitlabCheckout | null,
	current: GitlabCheckout | null,
): void {
	if (expected === null && current === null) return;
	if (
		expected &&
		current &&
		expected.connectionId === current.connectionId &&
		expected.projectId === current.projectId &&
		expected.pathWithNamespace === current.pathWithNamespace &&
		expected.cloneUrl === current.cloneUrl &&
		expected.defaultBranch === current.defaultBranch
	)
		return;
	throw userError({
		code: "CONFLICT",
		message:
			"The environment changed while this workspace was being saved; run it again",
		i18nKey: "serverError.environment.changedDuringPromote",
	});
}

export function rejectMixedGitlabConsumer(): never {
	throw userError({
		code: "BAD_REQUEST",
		message: "Choose GitHub repositories or one GitLab project",
		i18nKey: "serverError.environment.chooseRepositoryProvider",
	});
}

export async function requireAbsentGitlabConsumerBinding(
	executor: GitlabExecutor,
	environmentId: string,
): Promise<void> {
	const rows = executeRows(
		await executor.execute(
			sql`SELECT environment_id FROM gitlab_environment_projects WHERE environment_id = ${environmentId}::uuid`,
		),
	);
	if (rows.length)
		throw userError({
			code: "BAD_REQUEST",
			message: "Reconnect GitLab to clone this project",
			i18nKey: "serverError.cloudWorkspace.reconnectGitLab",
		});
}
