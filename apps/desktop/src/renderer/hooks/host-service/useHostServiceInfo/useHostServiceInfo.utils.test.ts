import { expect, test } from "bun:test";
import { readHostServiceInfo } from "./useHostServiceInfo.utils";

type Client = Parameters<typeof readHostServiceInfo>[0];
test("an older host without the update API stays readable but cannot offer in-app updates", async () => {
	const client = {
		health: { check: { query: async () => ({ version: "1.26.0" }) } },
		host: {
			info: {
				query: async () => {
					throw new Error("cloud unreachable");
				},
			},
		},
		system: {
			updateStatus: {
				query: async () => {
					throw new Error("procedure not found");
				},
			},
		},
	} as unknown as Client;
	expect(await readHostServiceInfo(client)).toEqual({
		version: "1.26.0",
		installSource: "unknown",
		updatable: false,
	});
});
test("capability comes from the live host, even if the reported install source is CLI", async () => {
	const client = {
		health: {
			check: {
				query: async () => ({ version: "1.26.0", installSource: "cli" }),
			},
		},
		host: {
			info: {
				query: async () => ({ platform: "darwin", arch: "arm64", uptime: 10 }),
			},
		},
		system: { updateStatus: { query: async () => ({ updatable: false }) } },
	} as unknown as Client;
	expect(await readHostServiceInfo(client)).toMatchObject({
		installSource: "cli",
		updatable: false,
		uptime: 10,
	});
	client.system.updateStatus.query = async () => ({ updatable: true }) as never;
	expect((await readHostServiceInfo(client)).updatable).toBe(true);
});
