import { describe, expect, mock, test } from "bun:test";
import { readHostUpdateSnapshot } from "./useHostServiceUpdate.utils";

type UpdateClient = Parameters<typeof readHostUpdateSnapshot>[0];

function clientWith(version: string, statusQuery: () => Promise<unknown>) {
	return {
		health: { check: { query: async () => ({ version }) } },
		system: { updateStatus: { query: statusQuery } },
	} as unknown as UpdateClient;
}

describe("readHostUpdateSnapshot", () => {
	test("recognizes the published successor even without the new status procedure", async () => {
		const query = mock(async () => {
			throw new Error('No procedure found on path "system.updateStatus"');
		});
		const result = await readHostUpdateSnapshot(
			clientWith("1.27.0", query),
			"1.27.0",
		);
		expect(result.health.version).toBe("1.27.0");
		expect(result.status).toBeNull();
		expect(query).not.toHaveBeenCalled();
	});

	test("keeps reading progress and rollback results while the old version answers", async () => {
		const status = {
			target: "1.27.0",
			startedAt: 1,
			error: null,
			updatable: true,
			installSource: "cli",
			phase: "idle",
			lastResult: {
				outcome: "rolled-back",
				from: "1.26.0",
				to: "1.27.0",
				at: 2,
			},
		} as const;
		const query = mock(async () => status);
		const result = await readHostUpdateSnapshot(
			clientWith("1.26.0", query),
			"1.27.0",
		);
		expect(result.status).toEqual(status);
		expect(query).toHaveBeenCalledTimes(1);
	});

	test("propagates disconnects so the caller keeps reconnecting", async () => {
		const client = clientWith("1.26.0", async () => ({}));
		client.health.check.query = mock(async () => {
			throw new Error("host down");
		});
		await expect(readHostUpdateSnapshot(client, "1.27.0")).rejects.toThrow(
			"host down",
		);
	});
});
