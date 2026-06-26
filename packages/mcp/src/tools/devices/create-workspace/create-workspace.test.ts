import { beforeEach, describe, expect, it, mock } from "bun:test";
import { z } from "zod";

const executeOnDeviceMock = mock(async (_input: Record<string, unknown>) => ({
	content: [],
}));
const getMcpContextMock = mock(() => ({
	organizationId: "org-1",
	userId: "user-1",
}));

mock.module("../../utils", () => ({
	executeOnDevice: executeOnDeviceMock,
	getMcpContext: getMcpContextMock,
}));

const { register } = await import("./create-workspace");

type RegisteredToolConfig = {
	inputSchema: Record<string, z.ZodTypeAny>;
};
type RegisteredToolHandler = (
	args: Record<string, unknown>,
	extra: unknown,
) => Promise<unknown>;

function getCreateWorkspaceTool() {
	let config: RegisteredToolConfig | null = null;
	let handler: RegisteredToolHandler | null = null;

	register({
		registerTool: (
			name: string,
			nextConfig: RegisteredToolConfig,
			nextHandler: RegisteredToolHandler,
		) => {
			if (name === "create_workspace") {
				config = nextConfig;
				handler = nextHandler;
			}
		},
	} as never);

	if (!config || !handler) {
		throw new Error("create_workspace was not registered");
	}

	return {
		config: config as RegisteredToolConfig,
		handler: handler as RegisteredToolHandler,
	};
}

describe("create_workspace MCP tool — sidebar pin support (#4919)", () => {
	beforeEach(() => {
		executeOnDeviceMock.mockClear();
		getMcpContextMock.mockClear();
	});

	it("accepts a pinToSidebar flag per workspace and forwards it to the device", async () => {
		const { config, handler } = getCreateWorkspaceTool();

		const inputSchema = z.object(config.inputSchema);
		const rawInput = {
			deviceId: "device-1",
			projectId: "project-1",
			workspaces: [
				{ name: "feat-a", pinToSidebar: true },
				{ name: "feat-b", pinToSidebar: false },
			],
		};

		// Parse through the registered schema, mirroring MCP server behavior.
		const parsed = inputSchema.parse(rawInput) as {
			workspaces: Array<{ name?: string; pinToSidebar?: boolean }>;
		};

		// Today the schema strips pinToSidebar, so MCP callers have no way to
		// communicate pin intent. Once a pin parameter is wired up these
		// assertions describe the contract the issue is asking for.
		expect(parsed.workspaces[0]).toMatchObject({ pinToSidebar: true });
		expect(parsed.workspaces[1]).toMatchObject({ pinToSidebar: false });

		await handler(rawInput, {});

		expect(executeOnDeviceMock).toHaveBeenCalledTimes(1);
		const forwarded = executeOnDeviceMock.mock.calls[0]?.[0] as {
			tool: string;
			params: {
				workspaces: Array<{ name?: string; pinToSidebar?: boolean }>;
			};
		};

		expect(forwarded.tool).toBe("create_workspace");
		expect(forwarded.params.workspaces[0]).toMatchObject({
			pinToSidebar: true,
		});
		expect(forwarded.params.workspaces[1]).toMatchObject({
			pinToSidebar: false,
		});
	});
});
