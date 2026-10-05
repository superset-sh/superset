import type { db } from "@superset/db/client";
import {
	cloudWorkspaceActivity,
	type InsertCloudWorkspaceActivity,
} from "@superset/db/schema";

type Executor = Pick<typeof db, "insert">;

export type CloudWorkspaceActor =
	| { kind: "user"; userId: string }
	| { kind: "system" };

export async function recordCloudWorkspaceActivity(
	executor: Executor,
	cloudWorkspaceId: string,
	actor: CloudWorkspaceActor,
	change: Omit<
		InsertCloudWorkspaceActivity,
		"id" | "cloudWorkspaceId" | "actorKind" | "actorUserId" | "createdAt"
	>,
) {
	await executor.insert(cloudWorkspaceActivity).values({
		cloudWorkspaceId,
		actorKind: actor.kind,
		actorUserId: actor.kind === "user" ? actor.userId : null,
		...change,
	});
}
