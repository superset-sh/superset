import { beforeEach, describe, expect, mock, test } from "bun:test";
import { pluginInstalls } from "@superset/db/schema";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

interface InstallRow {
	id: string;
	userId: string;
	marketplace: string;
	pluginName: string;
	manifest: unknown;
}

interface ConnectionRow {
	id: string;
	connector: string;
	connectedByUserId: string;
	disconnectedAt: Date | null;
}

const USER_ID = "user-1";
const dialect = new PgDialect();
const bound = (condition: SQL) => dialect.sqlToQuery(condition).params;

let installs: InstallRow[] = [];
let live: ConnectionRow[] = [];
let forgotten: string[] = [];

const rows = <T>(value: T[]) =>
	Object.assign(Promise.resolve(value), {
		limit: () => Promise.resolve(value),
		orderBy: () => Promise.resolve(value),
	});

mock.module("../../env", () => ({ env: {} }));
mock.module("@superset/auth/server", () => ({ auth: {} }));
mock.module("../../lib/analytics", () => ({ posthog: { capture: () => {} } }));
mock.module("./proxy", () => ({
	forgetUpstreamTools: (id: string) => forgotten.push(id),
}));

mock.module("./connections", () => ({
	installRecord: (_userId: string, pluginName: string) => {
		const row = installs.find((entry) => entry.pluginName === pluginName);
		return Promise.resolve(
			row && { id: row.id, marketplace: row.marketplace, siblings: 1 },
		);
	},
	installedPlugin: () => Promise.resolve(null),
	installById: () => Promise.resolve(null),
	installedManifest: () => Promise.resolve(null),
	AmbiguousPluginError: class extends Error {},
}));

mock.module("@superset/db/client", () => ({
	db: {
		select: () => ({
			from: (table: unknown) => ({
				where: (condition: SQL) => {
					if (table !== pluginInstalls) return rows([]);
					const values = bound(condition);
					return rows(
						installs.filter(
							(row) => values.includes(row.id) || values.includes(row.userId),
						),
					);
				},
			}),
		}),
		delete: () => ({
			where: (condition: SQL) => {
				const values = bound(condition);
				installs = installs.filter((row) => !values.includes(row.id));
				return Promise.resolve();
			},
		}),
		update: () => ({
			set: () => ({
				where: (condition: SQL) => ({
					returning: () => {
						const values = bound(condition);
						const hit = live.filter(
							(row) =>
								row.disconnectedAt === null &&
								values.includes(row.connector) &&
								values.includes(row.connectedByUserId),
						);
						for (const row of hit) row.disconnectedAt = new Date();
						return Promise.resolve(hit.map((row) => ({ id: row.id })));
					},
				}),
			}),
		}),
	},
	dbWs: {
		transaction: () => Promise.reject(new Error("dbWs is stubbed in tests")),
	},
}));

const { pluginsRouter } = await import("./plugins");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const caller = createCallerFactory(
	createTRPCRouter({ plugins: pluginsRouter }),
)(
	createTRPCContext({
		session: {
			user: { id: USER_ID, email: "me@superset.sh" },
			session: { activeOrganizationId: null },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	}),
);

const install = (overrides: Partial<InstallRow> = {}): InstallRow => ({
	id: "install-notion",
	userId: USER_ID,
	marketplace: "superset",
	pluginName: "notion",
	manifest: {
		name: "notion",
		version: "1.0.2",
		extensions: { superset: { connector: { slug: "notion" } } },
	},
	...overrides,
});

const connection = (
	id: string,
	connector: string,
	connectedByUserId = USER_ID,
): ConnectionRow => ({
	id,
	connector,
	connectedByUserId,
	disconnectedAt: null,
});

beforeEach(() => {
	installs = [];
	live = [];
	forgotten = [];
});

describe("plugins.uninstall", () => {
	test("disconnects the connector the published manifest names, not the stored one", async () => {
		installs = [install()];
		live = [
			connection("conn-mcp", "notion_mcp"),
			connection("conn-api", "notion"),
		];

		const result = await caller.plugins.uninstall({ name: "notion" });

		expect(result.disconnected).toBe(1);
		expect(live.find((row) => row.id === "conn-mcp")?.disconnectedAt).not.toBe(
			null,
		);
		expect(live.find((row) => row.id === "conn-api")?.disconnectedAt).toBe(
			null,
		);
		expect(forgotten).toEqual(["conn-mcp"]);
	});

	test("leaves the connector alone while another install still claims it", async () => {
		installs = [
			install(),
			install({
				id: "install-notes-acme",
				marketplace: "acme",
				pluginName: "notes",
				manifest: {
					name: "notes",
					version: "9.9.9",
					extensions: { superset: { connector: { slug: "notion_mcp" } } },
				},
			}),
		];
		live = [connection("conn-mcp", "notion_mcp")];

		const result = await caller.plugins.uninstall({ name: "notion" });

		expect(result.disconnected).toBe(0);
		expect(live[0]?.disconnectedAt).toBe(null);
	});

	test("another member's connection is untouched", async () => {
		installs = [install()];
		live = [connection("conn-theirs", "notion_mcp", "user-2")];

		const result = await caller.plugins.uninstall({ name: "notion" });

		expect(result.disconnected).toBe(0);
		expect(live[0]?.disconnectedAt).toBe(null);
	});
});
