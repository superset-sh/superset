import { db } from "@superset/db/client";
import { cloudWorkspaces, environments, tasks } from "@superset/db/schema";
import type { CloudAgentLaunch } from "@superset/shared/cloud-agent-launch";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { anchorAttachments } from "../../lib/attachments";
import {
	githubRepositoriesOutOfReach,
	githubUserTokenFor,
} from "../../lib/github-user";
import { nudge } from "../../lib/realtime";
import {
	environmentRepositoryRows,
	primaryRepository,
	recordWorkspaceRepositories,
	workspaceBranchName,
} from "../../lib/sandbox";
import { userError } from "../../trpc";
import { recordCloudWorkspaceActivity } from "./activity";
import { publishCloudWorkspaceJob } from "./jobs";
import {
	FALLBACK_NAME,
	type ProvisionCloudWorkspaceInput,
	provisionCloudWorkspace,
	sandboxNameFor,
} from "./provision";
import { linkTask } from "./record";
import { transitionCloudWorkspace } from "./transition";

/** An environment this user may start a workspace from, or a user-facing NOT_FOUND. */
export async function loadUsableEnvironment(args: {
	organizationId: string;
	userId: string;
	environmentId: string;
}) {
	const environment = await db.query.environments.findFirst({
		where: and(
			eq(environments.id, args.environmentId),
			eq(environments.organizationId, args.organizationId),
			isNull(environments.archivedAt),
		),
	});
	if (
		!environment ||
		(environment.scope === "personal" &&
			environment.createdByUserId !== args.userId)
	) {
		throw userError({
			code: "NOT_FOUND",
			message: "Environment not found in this organization",
			i18nKey: "serverError.cloudWorkspace.environmentNotFound",
		});
	}
	return environment;
}

/**
 * Records a cloud workspace and hands the sandbox off to a background job.
 *
 * Returns as soon as the row exists — in `provisioning`, with no sandbox
 * behind it yet — because the caller never waits on a sandbox: a person opens
 * the workspace on this id and watches the provisioning screen, and an
 * automation's run is done once `launch` is queued for first boot.
 *
 * The row is still written **before** anything is provisioned, so a crash
 * mid-provision leaves a `provisioning` row we can reconcile, rather than
 * an orphaned sandbox nothing references.
 */
export async function startCloudWorkspace(args: {
	organizationId: string;
	userId: string;
	environmentId: string;
	/** Omitted when nobody typed one; then the prompt names it. */
	name?: string;
	prompt?: string;
	/** What the person typed, kept on the record when it differs from the agent's prompt. */
	typedPrompt?: string;
	/** Omitted = the repo's default branch. */
	branch?: string;
	launch?: CloudAgentLaunch;
	taskIds?: string[];
	attachmentFileIds?: string[];
}) {
	const environment = await loadUsableEnvironment(args);

	// A workspace is started from an environment, and the environment's
	// repositories are its checkouts.
	const repositories = await environmentRepositoryRows(environment.id);
	if (repositories.length === 0) {
		throw userError({
			code: "BAD_REQUEST",
			message:
				"This environment has no repositories. Create an environment with repositories in Settings, then start the workspace from it",
			i18nKey: "serverError.cloudWorkspace.environmentHasNoRepositories",
		});
	}
	const primary = primaryRepository(
		repositories,
		environment.hooksRepositoryId,
	) as (typeof repositories)[number];
	const branch = args.branch ?? primary.defaultBranch;
	// A connected person's workspace acts as them on GitHub, so a
	// repository they cannot see would fail to clone later; say so now.
	const githubToken = await githubUserTokenFor(args.userId);
	if (githubToken) {
		const outOfReach = await githubRepositoriesOutOfReach({
			token: githubToken,
			repositories,
		});
		if (outOfReach.length > 0) {
			throw userError({
				code: "FORBIDDEN",
				message: `Your GitHub account cannot reach ${outOfReach.join(", ")}`,
				i18nKey: "serverError.cloudWorkspace.githubRepositoryOutOfReach",
			});
		}
	}

	// The id is generated here rather than by the database so the sandbox
	// name can be derived before the insert. A placeholder would briefly
	// leave two rows sharing ("vercel", ""), which the unique constraint
	// rejects whenever two creates overlap.
	const id = crypto.randomUUID();
	const providerSandboxId = sandboxNameFor(id);
	const name = args.name ?? FALLBACK_NAME;
	const [row] = await db
		.insert(cloudWorkspaces)
		.values({
			id,
			organizationId: args.organizationId,
			name,
			branch: workspaceBranchName({ id, name }),
			baseBranch: branch,
			provider: "vercel",
			providerSandboxId,
			status: "provisioning",
			environmentId: environment.id,
			createdByUserId: args.userId,
			prompt: (args.typedPrompt ?? args.prompt)?.trim() || null,
		})
		.returning();
	if (!row) {
		throw userError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Could not record cloud workspace",
			i18nKey: "serverError.cloudWorkspace.couldNotRecordCloudWorkspace",
		});
	}
	await recordWorkspaceRepositories({
		cloudWorkspaceId: row.id,
		repositories,
	});
	const actor = { kind: "user" as const, userId: args.userId };
	await recordCloudWorkspaceActivity(db, row.id, actor, { event: "created" });
	if (args.taskIds?.length) {
		const ownTasks = await db
			.select({ id: tasks.id })
			.from(tasks)
			.where(
				and(
					inArray(tasks.id, args.taskIds),
					eq(tasks.organizationId, args.organizationId),
					isNull(tasks.deletedAt),
				),
			);
		for (const task of ownTasks) {
			await linkTask({ cloudWorkspaceId: row.id, taskId: task.id, actor });
		}
	}
	await anchorAttachments({
		parentKind: "cloud_workspace",
		parentId: row.id,
		organizationId: args.organizationId,
		fileIds: args.attachmentFileIds ?? [],
	}).catch((error) => {
		console.error(
			`[cloud-workspace] could not keep the prompt's files for ${row.id}`,
			error,
		);
	});

	// Naming reads the prompt, and only when nobody typed a name.
	const job = {
		cloudWorkspaceId: row.id,
		...(args.name ? {} : { namingPrompt: args.prompt ?? "" }),
		...(args.launch ? { launch: args.launch } : {}),
	};

	nudge(row.organizationId, "cloud_workspaces");
	await queueProvision(job);
	return row;
}

/**
 * Hands a `provisioning` row to the provisioning job. A job that cannot be
 * queued fails the row, so it never waits on a job that is not coming.
 */
export async function queueProvision(
	job: ProvisionCloudWorkspaceInput,
): Promise<void> {
	try {
		await publishCloudWorkspaceJob({
			path: "/api/cloud-workspaces/provision",
			body: job,
			runLocally: provisionCloudWorkspace,
		});
	} catch (error) {
		// Nothing was provisioned, so there is no sandbox to tear down —
		// but the row must not sit in `provisioning` with no job coming.
		await transitionCloudWorkspace({
			id: job.cloudWorkspaceId,
			from: ["provisioning"],
			to: "failed",
		});
		console.error(
			`[cloud-workspace] could not queue provisioning for ${job.cloudWorkspaceId}`,
			error,
		);
		throw userError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Could not start cloud workspace provisioning",
			i18nKey:
				"serverError.cloudWorkspace.couldNotStartCloudWorkspaceProvisioning",
		});
	}
}
