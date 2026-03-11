import { describe, expect, it } from "bun:test";
import { createWorkspaceFsClient } from "./index";

describe("createWorkspaceFsClient", () => {
	it("adapts a transport-neutral request/subscribe client to the service contract", async () => {
		const calls: Array<{ method: string; input: unknown }> = [];
		const client = createWorkspaceFsClient({
			async request(method, input) {
				calls.push({ method, input });
				if (method === "getServiceInfo") {
					return {
						hostKind: "remote",
						resourceScheme: "workspace-fs",
						pathIdentity: "absolute-path",
						capabilities: {
							read: true,
							write: true,
							watch: true,
							searchFiles: true,
							searchKeyword: true,
							trash: false,
							resourceUris: true,
						},
					};
				}

				if (method === "listDirectory") {
					return [];
				}

				throw new Error(`Unexpected method: ${method}`);
			},
			async *subscribe(method, input) {
				calls.push({ method, input });
				yield {
					type: "overflow",
					workspaceId: "workspace-1",
					revision: 1,
				};
			},
		});

		const serviceInfo = await client.getServiceInfo();
		expect(serviceInfo.hostKind).toEqual("remote");

		const entries = await client.listDirectory({
			workspaceId: "workspace-1",
			absolutePath: "/tmp/workspace",
		});
		expect(entries).toEqual([]);

		const iterator = client
			.watchWorkspace({ workspaceId: "workspace-1" })
			[Symbol.asyncIterator]();
		const next = await iterator.next();
		expect(next).toEqual({
			value: {
				type: "overflow",
				workspaceId: "workspace-1",
				revision: 1,
			},
			done: false,
		});

		expect(calls).toEqual([
			{ method: "getServiceInfo", input: undefined },
			{
				method: "listDirectory",
				input: {
					workspaceId: "workspace-1",
					absolutePath: "/tmp/workspace",
				},
			},
			{
				method: "watchWorkspace",
				input: {
					workspaceId: "workspace-1",
				},
			},
		]);
	});
});
