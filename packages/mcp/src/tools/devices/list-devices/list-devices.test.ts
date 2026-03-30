import { beforeEach, describe, expect, it, mock } from "bun:test";
import { z } from "zod";

const getMcpContextMock = mock(() => ({ organizationId: "org-1" }));

let fetchedDevices = [
	{
		deviceId: "device-online",
		deviceName: "Ada's MacBook",
		deviceType: "desktop",
		lastSeenAt: new Date(Date.now() - 30_000),
		ownerId: "user-1",
		ownerName: "Ada",
		ownerEmail: "ada@example.com",
	},
	{
		deviceId: "device-offline",
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

mock.module("../../utils", () => ({
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
			isOnline: boolean;
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
				deviceId: "device-online",
				deviceName: "Ada's MacBook",
				deviceType: "desktop",
				lastSeenAt: new Date(Date.now() - 30_000),
				ownerId: "user-1",
				ownerName: "Ada",
				ownerEmail: "ada@example.com",
			},
			{
				deviceId: "device-offline",
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

	it("registers input and output schemas that validate includeOffline and isOnline", async () => {
		const { config, handler } = createTool();
		const inputSchema = z.object(config.inputSchema);
		const outputSchema = z.object(config.outputSchema);

		expect(inputSchema.parse({})).toEqual({ includeOffline: false });
		expect(inputSchema.parse({ includeOffline: true })).toEqual({
			includeOffline: true,
		});

		const result = await handler({ includeOffline: true }, {});

		expect(() => outputSchema.parse(result.structuredContent)).not.toThrow();
	});

	it("returns only online devices by default", async () => {
		const { handler } = createTool();

		const result = await handler({}, {});

		expect(getMcpContextMock).toHaveBeenCalledTimes(1);
		expect(selectMock).toHaveBeenCalledTimes(1);
		expect(result.structuredContent?.devices).toEqual([
			{
				deviceId: "device-online",
				deviceName: "Ada's MacBook",
				deviceType: "desktop",
				lastSeenAt: expect.any(String),
				ownerId: "user-1",
				ownerName: "Ada",
				ownerEmail: "ada@example.com",
				isOnline: true,
			},
		]);
	});

	it("includes offline devices when requested and marks them offline", async () => {
		const { handler } = createTool();

		const result = await handler({ includeOffline: true }, {});

		expect(result.structuredContent?.devices).toHaveLength(2);
		expect(result.structuredContent?.devices).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					deviceId: "device-online",
					isOnline: true,
				}),
				expect.objectContaining({
					deviceId: "device-offline",
					isOnline: false,
				}),
			]),
		);
	});
});
