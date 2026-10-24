import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

let host: TestHost;

beforeAll(async () => {
	host = await createTestHost();
});

afterAll(async () => {
	await host.dispose();
});

/** A request body that stays open until the test closes it. */
function openBody(): {
	stream: ReadableStream<Uint8Array>;
	finish: (text: string) => void;
} {
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	const stream = new ReadableStream<Uint8Array>({
		start(c) {
			controller = c;
		},
	});
	return {
		stream,
		finish(text) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		},
	};
}

describe("tRPC request bodies", () => {
	// A sandbox's ingress drops the exchange when the host answers before the
	// upload is complete, so a streamed batch must not start its response
	// until the whole body has arrived.
	it("does not answer a streamed batch before the body has fully arrived", async () => {
		const body = openBody();
		let settled = false;
		const response = host
			.fetch("http://host-service.test/trpc/health.check?batch=1", {
				method: "POST",
				headers: {
					authorization: `Bearer ${host.psk}`,
					"content-type": "application/json",
					"trpc-accept": "application/jsonl",
				},
				body: body.stream,
				// @ts-expect-error -- required by the Fetch spec for a stream body
				duplex: "half",
			})
			.then((res) => {
				settled = true;
				return res;
			});

		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(settled).toBe(false);

		body.finish(JSON.stringify({ "0": { json: null } }));
		const res = await response;
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('"status":"ok"');
	});
});
