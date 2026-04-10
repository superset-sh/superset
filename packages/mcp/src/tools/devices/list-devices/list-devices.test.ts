import { beforeEach, describe, expect, it, mock } from "bun:test";
import { z } from "zod";

const getMcpContextMock = mock(() => ({ organizationId: "org-1" }));

let fetchedDevices = [
	{
		deviceId: "device-a",
		deviceName: "Ada's MacBook",
		deviceType: "desktop",
		lastSeenAt: new Date(Date.now() - 30_000),
		ownerId: "user-1",
		ownerName: "Ada",
		ownerEmail: "ada@example.com",
	},
	{
		deviceId: "device-b",
		deviceName: "Grace's iPhone",
		deviceType: "mobile",
		lastSeenAt: new Date(Date.now() - 120_000),
		ownerId: "user-2",
		ownerName: "Grace",
		ownerEmail: "grace@example.com",
	},
];

const selectMock = mock(() => ({
	from: () => ({
		innerJoin: () => ({
			where: () => ({
				orderBy: async () => fetchedDevices,
			}),
		}),
	}),
}));

mock.module("@superset/db/client", () => ({
	db: {
		select: selectMock,
	},
}));

// mock.module is process-global in bun test. Preserve every real export
// (notably executeOnDevice, which start-agent-session.test.ts imports after
// this file mounts its mocks) so sibling test files don't break.
const realUtils = await import("../../utils");
mock.module("../../utils", () => ({
	...realUtils,
	getMcpContext: getMcpContextMock,
}));

const { register } = await import("./index");

type RegisteredToolHandler = (
	args: Record<string, unknown>,
	extra: unknown,
) => Promise<{
	content?: Array<{ text?: string }>;
	isError?: boolean;
	structuredContent?: {
		devices: Array<{
			deviceId: string;
			deviceName: string | null;
			deviceType: string;
			lastSeenAt: string;
			ownerId: string;
			ownerName: string | null;
			ownerEmail: string;
		}>;
	};
}>;

type RegisteredToolConfig = {
	inputSchema: Record<string, z.ZodTypeAny>;
	outputSchema: Record<string, z.ZodTypeAny>;
};

function createTool() {
	let config: RegisteredToolConfig | null = null;
	let handler: RegisteredToolHandler | null = null;

	register({
		registerTool: (
			name: string,
			nextConfig: RegisteredToolConfig,
			nextHandler: RegisteredToolHandler,
		) => {
			if (name === "list_devices") {
				config = nextConfig;
				handler = nextHandler;
			}
		},
	} as never);

	if (!config || !handler) {
		throw new Error("list_devices was not registered");
	}

	return {
		config: config as RegisteredToolConfig,
		handler: handler as RegisteredToolHandler,
	};
}

describe("list_devices MCP tool", () => {
	beforeEach(() => {
		fetchedDevices = [
			{
				deviceId: "device-a",
				deviceName: "Ada's MacBook",
				deviceType: "desktop",
				lastSeenAt: new Date(Date.now() - 30_000),
				ownerId: "user-1",
				ownerName: "Ada",
				ownerEmail: "ada@example.com",
			},
			{
				deviceId: "device-b",
				deviceName: "Grace's iPhone",
				deviceType: "mobile",
				lastSeenAt: new Date(Date.now() - 120_000),
				ownerId: "user-2",
				ownerName: "Grace",
				ownerEmail: "grace@example.com",
			},
		];
		getMcpContextMock.mockClear();
		selectMock.mockClear();
	});

	it("registers an output schema that validates the device list", async () => {
		const { config, handler } = createTool();
		const outputSchema = z.object(config.outputSchema);

		const result = await handler({}, {});

		expect(() => outputSchema.parse(result.structuredContent)).not.toThrow();
	});

	it("returns every registered device regardless of lastSeenAt", async () => {
		const { handler } = createTool();

		const result = await handler({}, {});

		expect(getMcpContextMock).toHaveBeenCalledTimes(1);
		expect(selectMock).toHaveBeenCalledTimes(1);
		expect(result.structuredContent?.devices).toEqual([
			{
				deviceId: "device-a",
				deviceName: "Ada's MacBook",
				deviceType: "desktop",
				lastSeenAt: expect.any(String),
				ownerId: "user-1",
				ownerName: "Ada",
				ownerEmail: "ada@example.com",
			},
			{
				deviceId: "device-b",
				deviceName: "Grace's iPhone",
				deviceType: "mobile",
				lastSeenAt: expect.any(String),
				ownerId: "user-2",
				ownerName: "Grace",
				ownerEmail: "grace@example.com",
			},
		]);
	});
});
