import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
	terminalSessions,
	workspaces,
	workspaceTags,
} from "../../src/db/schema";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createProjectScenario } from "../helpers/scenarios";
import { seedTerminalSession } from "../helpers/seed";

test("rejects shared-checkout adoption without deleting sibling identities", async () => {
	const s = await createProjectScenario({
		hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
	});
	try {
		const a = await s.host.trpc.workspaces.create.mutate({
			projectId: s.projectId,
			checkout: "local",
			name: "one",
		});
		const b = await s.host.trpc.workspaces.create.mutate({
			projectId: s.projectId,
			checkout: "local",
			name: "two",
			tags: ["audit-tag"],
		});
		seedTerminalSession(s.host, { originWorkspaceId: b.workspace.id });
		await s.repo.git.raw(["checkout", "-b", "audit-new-branch"]);
		s.host.db
			.update(workspaces)
			.set({ branch: "main" })
			.where(eq(workspaces.projectId, s.projectId))
			.run();
		await expect(
			s.host.trpc.workspaces.create.mutate({
				projectId: s.projectId,
				worktreePath: s.repo.repoPath,
			}),
		).rejects.toMatchObject({ data: { code: "CONFLICT" } });
		const rows = s.host.db.select().from(workspaces).all();
		expect(rows.map((r) => r.id)).toContain(a.workspace.id);
		expect(rows.map((r) => r.id)).toContain(b.workspace.id);
		expect(
			s.host.db.select().from(terminalSessions).all()[0]?.originWorkspaceId,
		).toBe(b.workspace.id);
		expect(s.host.db.select().from(workspaceTags).all()).toHaveLength(1);
	} finally {
		await s.dispose();
	}
});

test("rejects worktree selection for the shared-checkout branch", async () => {
	const s = await createProjectScenario({
		hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
	});
	try {
		const a = await s.host.trpc.workspaces.create.mutate({
			projectId: s.projectId,
			checkout: "local",
			name: "one",
		});
		await expect(
			s.host.trpc.workspaces.create.mutate({
				projectId: s.projectId,
				checkout: "worktree",
				branch: "main",
				name: "isolated",
			}),
		).rejects.toMatchObject({ data: { code: "CONFLICT" } });
		expect(
			s.host.db
				.select()
				.from(workspaces)
				.all()
				.map((row) => row.id),
		).toEqual([a.workspace.id]);
	} finally {
		await s.dispose();
	}
});

test("rejects PR creation on the shared-checkout branch", async () => {
	const s = await createProjectScenario({
		hostOptions: {
			apiOverrides: cloudFlows.workspaceCreateOk(),
			execGh: async () => ({
				number: 42,
				url: "https://github.com/example/repo/pull/42",
				title: "Audit",
				headRefName: "main",
				headRefOid: "0".repeat(40),
				baseRefName: "base",
				headRepositoryOwner: { login: "example" },
				headRepository: { name: "repo" },
				isCrossRepository: false,
				state: "OPEN",
			}),
		},
	});
	try {
		const a = await s.host.trpc.workspaces.create.mutate({
			projectId: s.projectId,
			checkout: "local",
			name: "one",
		});
		await expect(
			s.host.trpc.workspaces.create.mutate({ projectId: s.projectId, pr: 42 }),
		).rejects.toMatchObject({ data: { code: "CONFLICT" } });
		expect(
			s.host.db
				.select()
				.from(workspaces)
				.all()
				.map((row) => row.id),
		).toEqual([a.workspace.id]);
	} finally {
		await s.dispose();
	}
});

test("Local endpoint creates and reuses only a shared-checkout identity", async () => {
	const s = await createProjectScenario();
	try {
		const id = crypto.randomUUID();
		const first = await s.host.trpc.workspaces.createLocal.mutate({
			projectId: s.projectId,
			id,
		});
		const retry = await s.host.trpc.workspaces.createLocal.mutate({
			projectId: s.projectId,
			id,
		});
		expect(first.workspace.type).toBe("local");
		expect(retry.workspace.id).toBe(id);
		expect(retry.alreadyExists).toBe(true);
		expect(s.host.db.select().from(workspaces).all()).toHaveLength(1);
		expect(
			(await s.repo.git.raw(["worktree", "list", "--porcelain"])).match(
				/^worktree /gm,
			),
		).toHaveLength(1);
		await expect(
			s.host.trpc.workspaces.createLocal.mutate({
				projectId: s.projectId,
				branch: "feature",
			}),
		).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
	} finally {
		await s.dispose();
	}
});

test("adopting an independent worktree preserves stale local branch records", async () => {
	const s = await createProjectScenario();
	try {
		const local = await s.host.trpc.workspaces.createLocal.mutate({
			projectId: s.projectId,
		});
		const path = `${s.repo.repoPath}/.worktrees/adopt`;
		await s.repo.git.raw(["worktree", "add", "-b", "adopt", path]);
		s.host.db
			.update(workspaces)
			.set({ branch: "adopt" })
			.where(eq(workspaces.id, local.workspace.id))
			.run();
		const adopted = await s.host.trpc.workspaces.create.mutate({
			projectId: s.projectId,
			worktreePath: path,
		});
		expect(adopted.workspace.type).toBe("worktree");
		expect(adopted.workspace.id).not.toBe(local.workspace.id);
		expect(s.host.db.select().from(workspaces).all()).toHaveLength(2);
	} finally {
		await s.dispose();
	}
});

test("Local enqueue endpoint settles with a shared-checkout row", async () => {
	const s = await createProjectScenario();
	try {
		const id = crypto.randomUUID();
		const settled = Promise.withResolvers<unknown>();
		const original = s.host.eventBus.broadcastWorkspaceCreateSettled.bind(
			s.host.eventBus,
		);
		s.host.eventBus.broadcastWorkspaceCreateSettled = (event) => {
			original(event);
			settled.resolve(event);
		};
		expect(
			await s.host.trpc.workspaces.createLocalEnqueued.mutate({
				projectId: s.projectId,
				id,
			}),
		).toEqual({ workspaceId: id });
		expect(await settled.promise).toMatchObject({
			ok: true,
			canonicalWorkspaceId: id,
			alreadyExists: false,
		});
		expect(
			s.host.db.select().from(workspaces).where(eq(workspaces.id, id)).get()
				?.type,
		).toBe("local");
	} finally {
		await s.dispose();
	}
});

test("legacy worktree-typed checkout rows cannot satisfy worktree creation", async () => {
	const s = await createProjectScenario();
	try {
		const local = await s.host.trpc.workspaces.createLocal.mutate({
			projectId: s.projectId,
		});
		s.host.db
			.update(workspaces)
			.set({ type: "worktree" })
			.where(eq(workspaces.id, local.workspace.id))
			.run();
		await expect(
			s.host.trpc.workspaces.create.mutate({
				projectId: s.projectId,
				checkout: "worktree",
				branch: "main",
			}),
		).rejects.toMatchObject({ data: { code: "CONFLICT" } });
		expect(s.host.db.select().from(workspaces).all()).toHaveLength(1);
	} finally {
		await s.dispose();
	}
});
