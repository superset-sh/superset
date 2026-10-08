import { beforeEach, describe, expect, test } from "bun:test";
import * as verifyQstash from "@/lib/verifyQstash";
import { stub } from "../../../../../../test/stub";
import * as job from "./purgeExpiredDeletions";

let calls: Array<{ dryRun: boolean }> = [];

stub(verifyQstash, {
	verifyQstashRequest: async () => null,
});
stub(job, {
	purgeExpiredDeletions: async ({ dryRun }: { dryRun: boolean }) => {
		calls.push({ dryRun });
		return { dryRun };
	},
});

const { POST } = await import("./route");

const post = (body?: string) =>
	POST(
		new Request("http://localhost/api/account/jobs/purge-expired-deletions", {
			method: "POST",
			body,
		}),
	);

describe("POST /api/account/jobs/purge-expired-deletions", () => {
	beforeEach(() => {
		calls = [];
	});

	test("an empty body is a dry run", async () => {
		await post();
		await post("{}");
		expect(calls).toEqual([{ dryRun: true }, { dryRun: true }]);
	});

	test('purges only for an explicit {"dryRun": false}', async () => {
		await post(JSON.stringify({ dryRun: false }));
		expect(calls).toEqual([{ dryRun: false }]);
	});

	test("rejects a body it cannot read rather than guessing", async () => {
		expect((await post("not json")).status).toBe(400);
		expect((await post(JSON.stringify({ dryRun: "false" }))).status).toBe(400);
		expect(calls).toEqual([]);
	});
});
