import { describe, expect, it } from "bun:test";
import {
	CRITICAL_PRELOAD_COLLECTION_NAMES,
	type Preloadable,
	partitionCollectionsForPreload,
	preloadCollectionsInTiers,
} from "./preloadPriority";

/**
 * A fake collection that records when its preload started and lets the test
 * control when it resolves. `delayMs: "manual"` keeps the preload pending until
 * `resolve()` is called, simulating a heavy collection (e.g. 116 MB of
 * `applied_tx` history) that takes a long time to hydrate.
 */
function makeFakeCollection(name: string, log: string[]) {
	let resolveFn: (() => void) | null = null;
	const collection: Preloadable & { name: string; resolve: () => void } = {
		name,
		preload: () => {
			log.push(name);
			return new Promise<void>((resolve) => {
				resolveFn = resolve;
			});
		},
		resolve: () => resolveFn?.(),
	};
	return collection;
}

function makeInstantCollection(name: string, log: string[]): Preloadable {
	return {
		preload: () => {
			log.push(name);
			return Promise.resolve();
		},
	};
}

describe("partitionCollectionsForPreload", () => {
	it("routes the workspace-shell collections into the critical tier", () => {
		const noop = () => Promise.resolve();
		const collections = {
			v2Workspaces: { preload: noop },
			v2Hosts: { preload: noop },
			v2Projects: { preload: noop },
			tasks: { preload: noop },
			githubPullRequests: { preload: noop },
			automationRuns: { preload: noop },
		};

		const { critical, deferred } = partitionCollectionsForPreload(collections);

		expect(critical).toContain(collections.v2Workspaces);
		expect(critical).toContain(collections.v2Hosts);
		expect(critical).toContain(collections.v2Projects);
		// Heavy collections are deferred, not blocking workspace open.
		expect(deferred).toContain(collections.tasks);
		expect(deferred).toContain(collections.githubPullRequests);
		expect(deferred).toContain(collections.automationRuns);
	});

	it("never preloads the shared organizations collection", () => {
		const noop = () => Promise.resolve();
		const collections = {
			organizations: { preload: noop },
			v2Workspaces: { preload: noop },
			tasks: { preload: noop },
		};

		const { critical, deferred } = partitionCollectionsForPreload(collections);

		expect(critical).not.toContain(collections.organizations);
		expect(deferred).not.toContain(collections.organizations);
	});
});

describe("preloadCollectionsInTiers (issue #5015)", () => {
	/**
	 * Reproduction: the workspace shell needs `v2Workspaces` ready to render, but
	 * the desktop app preloaded every collection in a single batch. A heavy,
	 * slow-to-hydrate collection (`tasks`) would then keep the whole preload —
	 * and the shared SQLite/Electric I/O — busy, delaying the tiny critical
	 * collections by tens of seconds.
	 *
	 * This test proves the fix: preload resolves as soon as the critical tier is
	 * ready, while the heavy `tasks` collection is still hydrating.
	 */
	it("resolves once critical collections are ready, without waiting on heavy ones", async () => {
		const startOrder: string[] = [];
		const tasks = makeFakeCollection("tasks", startOrder);

		const collections: Record<string, Preloadable> = {
			v2Workspaces: makeInstantCollection("v2Workspaces", startOrder),
			v2Hosts: makeInstantCollection("v2Hosts", startOrder),
			v2Projects: makeInstantCollection("v2Projects", startOrder),
			// Heavy collection that never resolves on its own during this test.
			tasks,
		};

		let settled = false;
		const preloadPromise = preloadCollectionsInTiers(collections).then(() => {
			settled = true;
		});

		await preloadPromise;

		// Critical collections were all preloaded...
		expect(startOrder).toContain("v2Workspaces");
		expect(startOrder).toContain("v2Hosts");
		expect(startOrder).toContain("v2Projects");
		// ...and the preload resolved even though `tasks` is still pending. Under
		// the old single-batch behavior this promise would hang on `tasks`.
		expect(settled).toBe(true);

		// The heavy collection is still kicked off in the background.
		expect(startOrder).toContain("tasks");
		tasks.resolve();
	});

	it("starts critical collections before resolving so they win the I/O race", async () => {
		const startOrder: string[] = [];
		const collections: Record<string, Preloadable> = {
			tasks: makeInstantCollection("tasks", startOrder),
			v2Workspaces: makeInstantCollection("v2Workspaces", startOrder),
			v2Hosts: makeInstantCollection("v2Hosts", startOrder),
		};

		await preloadCollectionsInTiers(collections);

		const firstCritical = startOrder.indexOf("v2Workspaces");
		const tasksIndex = startOrder.indexOf("tasks");
		// Critical collections preload in the first tier; `tasks` only after the
		// critical tier has settled.
		expect(firstCritical).toBeLessThan(tasksIndex);
	});

	it("keeps v2Workspaces in the documented critical set", () => {
		expect(CRITICAL_PRELOAD_COLLECTION_NAMES).toContain("v2Workspaces");
		expect(CRITICAL_PRELOAD_COLLECTION_NAMES).toContain("v2Hosts");
		expect(CRITICAL_PRELOAD_COLLECTION_NAMES).toContain("v2Projects");
	});
});
