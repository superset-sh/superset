import { eq } from "drizzle-orm";
import type { HostDb } from "../../db/index.ts";
import { workspaces } from "../../db/schema.ts";
import {
	checkDockerAvailable,
	listManagedContainers,
	removeContainer,
} from "./docker-cli.ts";
import { getSupersetHomeDir } from "./paths.ts";

/**
 * Startup sweep: remove Superset-managed containers whose workspace row is
 * gone or archived (deleted while docker was down, crashed mid-destroy).
 * Never starts containers — the first PTY of a live workspace does that.
 * Quiet no-op when docker isn't running.
 */
export async function runSandboxReconcile(db: HostDb): Promise<void> {
	const availability = await checkDockerAvailable();
	if (!availability.ok) return;

	const containers = await listManagedContainers();
	if (containers.length === 0) return;

	const ownerHome = getSupersetHomeDir();
	for (const container of containers) {
		// Only sweep containers THIS host instance created. Several instances
		// share one docker daemon (dev app, integration tests, multiple orgs);
		// another instance's live workspace looks like an orphan in our DB.
		// Unlabeled containers (pre-ownership builds) are left alone too —
		// never delete what we can't prove we own.
		if (container.ownerHome !== ownerHome) continue;
		const workspace = container.workspaceId
			? db.query.workspaces
					.findFirst({
						where: eq(workspaces.id, container.workspaceId),
					})
					.sync()
			: undefined;
		const live = workspace && workspace.archivedAt === null;
		if (live) continue;
		console.log(
			`[sandbox] reconcile: removing orphan container ${container.name}`,
		);
		await removeContainer(container.name);
	}
}
