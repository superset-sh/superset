import { describe, expect, it } from "bun:test";
import { createFsClient } from "./index";

describe("createFsClient", () => {
	it("adapts a transport-neutral request/subscribe client to the service contract", async () => {
		const calls: Array<{ method: string; input: unknown }> = [];
		const client = createFsClient({
			async request(method, input) {
				calls.push({ method, input });

				if (method === "listDirectory") {
					return { entries: [] };
				}

				if (method === "readFile") {
					return {
						kind: "text",
						content: "hello",
						byteLength: 5,
						exceededLimit: false,
						revision: "123:5",
					};
				}

				if (method === "getMetadata") {
					return null;
				}

				throw new Error(`Unexpected method: ${method}`);
			},
			async *subscribe(method, input) {
				calls.push({ method, input });
				yield {
					events: [
						{
							kind: "overflow" as const,
							absolutePath: "/tmp/workspace",
						},
					],
				};
			},
		});

		const { entries } = await client.listDirectory({
			absolutePath: "/tmp/workspace",
		});
		expect(entries).toEqual([]);

		const readResult = await client.readFile({
			absolutePath: "/tmp/workspace/file.txt",
			encoding: "utf-8",
		});
		expect(readResult.kind).toEqual("text");
		if (readResult.kind === "text") {
			expect(readResult.content).toEqual("hello");
		}
		expect(readResult.revision).toEqual("123:5");

		const metadata = await client.getMetadata({
			absolutePath: "/tmp/workspace/missing",
		});
		expect(metadata).toBeNull();

		const iterator = client
			.watchPath({ absolutePath: "/tmp/workspace", recursive: true })
			[Symbol.asyncIterator]();
		const next = await iterator.next();
		expect(next).toEqual({
			value: {
				events: [
					{
						kind: "overflow",
						absolutePath: "/tmp/workspace",
					},
				],
			},
			done: false,
		});

		expect(calls).toEqual([
			{
				method: "listDirectory",
				input: { absolutePath: "/tmp/workspace" },
			},
			{
				method: "readFile",
				input: {
					absolutePath: "/tmp/workspace/file.txt",
					encoding: "utf-8",
				},
			},
			{
				method: "getMetadata",
				input: { absolutePath: "/tmp/workspace/missing" },
			},
			{
				method: "watchPath",
				input: { absolutePath: "/tmp/workspace", recursive: true },
			},
		]);
	});
});
