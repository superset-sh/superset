import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as sandbox from "../../lib/sandbox";
import * as jobs from "./jobs";

type Row = {
	status: string;
	deletedAt: Date | null;
	provider: string;
	providerSandboxId: string;
};
type Stage = "stop" | "delete";

let row: Row | undefined;
let sandboxCalls: string[] = [];
let queued: Array<{ path: string; body: unknown; delaySeconds?: number }> = [];
let failingStage: Stage | null = null;

stub(db.query.cloudWorkspaces, { findFirst: () => Promise.resolve(row) });
stub(sandbox, {
	stopSandbox: (id: string) => {
		sandboxCalls.push(`stop:${id}`);
		return Promise.resolve();
	},
	deleteSandbox: (id: string) => {
		sandboxCalls.push(`delete:${id}`);
		return Promise.resolve();
	},
});
stub(jobs, {
	publishCloudWorkspaceJob: (job: {
		path: string;
		body: { stage: Stage };
		delaySeconds?: number;
	}) => {
		if (job.body.stage === failingStage) {
			return Promise.reject(new Error("qstash down"));
		}
		queued.push({
			path: job.path,
			body: job.body,
			delaySeconds: job.delaySeconds,
		});
		return Promise.resolve();
	},
});

const { queueReap, reapArchivedCloudWorkspace } = await import("./reap");

const archivedAt = new Date("2026-10-01T00:00:00.000Z");
const input = {
	cloudWorkspaceId: "00000000-0000-0000-0000-000000000001",
	archivedAt: archivedAt.toISOString(),
};
const SEVEN_DAYS = 7 * 24 * 60 * 60;

describe("queueReap", () => {
	beforeEach(() => {
		sandboxCalls = [];
		queued = [];
		failingStage = null;
	});

	test("queues the delete after seven days and the stop after a minute", async () => {
		await queueReap(input, "ws-box");
		expect(queued).toEqual([
			{
				path: "/api/cloud-workspaces/reap",
				body: { ...input, stage: "delete" },
				delaySeconds: SEVEN_DAYS,
			},
			{
				path: "/api/cloud-workspaces/reap",
				body: { ...input, stage: "stop" },
				delaySeconds: 60,
			},
		]);
		expect(sandboxCalls).toEqual([]);
	});

	test("a stop that could not be queued stops the box now and keeps the disk", async () => {
		failingStage = "stop";
		await queueReap(input, "ws-box");
		expect(sandboxCalls).toEqual(["stop:ws-box"]);
		expect(queued.map((job) => (job.body as { stage: Stage }).stage)).toEqual([
			"delete",
		]);
	});

	test("a delete that could not be queued throws so the caller deletes the box", async () => {
		failingStage = "delete";
		await expect(queueReap(input, "ws-box")).rejects.toThrow("qstash down");
		expect(queued).toEqual([]);
	});
});

describe("reapArchivedCloudWorkspace", () => {
	beforeEach(() => {
		row = {
			status: "deleted",
			deletedAt: archivedAt,
			provider: "vercel",
			providerSandboxId: "ws-box",
		};
		sandboxCalls = [];
		queued = [];
	});

	test("the stop stage only stops the box", async () => {
		expect(await reapArchivedCloudWorkspace({ ...input, stage: "stop" })).toBe(
			"stopped",
		);
		expect(sandboxCalls).toEqual(["stop:ws-box"]);
		expect(queued).toEqual([]);
	});

	test("the delete stage deletes the box", async () => {
		expect(
			await reapArchivedCloudWorkspace({ ...input, stage: "delete" }),
		).toBe("reaped");
		expect(sandboxCalls).toEqual(["delete:ws-box"]);
	});

	for (const stage of ["stop", "delete"] as const) {
		test(`the ${stage} stage leaves an unarchived workspace alone`, async () => {
			row = { ...(row as Row), status: "ready", deletedAt: null };
			expect(await reapArchivedCloudWorkspace({ ...input, stage })).toBe(
				"skipped",
			);
			expect(sandboxCalls).toEqual([]);
		});

		test(`the ${stage} stage leaves a later archive's box alone`, async () => {
			row = {
				...(row as Row),
				deletedAt: new Date("2026-10-02T00:00:00.000Z"),
			};
			expect(await reapArchivedCloudWorkspace({ ...input, stage })).toBe(
				"skipped",
			);
			expect(sandboxCalls).toEqual([]);
		});
	}

	test("a missing row or a retired provider is skipped", async () => {
		row = undefined;
		expect(
			await reapArchivedCloudWorkspace({ ...input, stage: "delete" }),
		).toBe("skipped");
		row = {
			status: "deleted",
			deletedAt: archivedAt,
			provider: "e2b",
			providerSandboxId: "old-box",
		};
		expect(
			await reapArchivedCloudWorkspace({ ...input, stage: "delete" }),
		).toBe("skipped");
		expect(sandboxCalls).toEqual([]);
	});
});
