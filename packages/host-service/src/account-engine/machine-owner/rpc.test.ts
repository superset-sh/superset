import { expect, it } from "bun:test";
import { createConnection, createServer } from "node:net";
import { TRPCError } from "@trpc/server";
import { AccountRpc } from "./rpc.ts";

it("supports owner callbacks and preserves mutation refusal codes", async () => {
	let accepted: AccountRpc | undefined;
	const server = createServer((socket) => {
		accepted = new AccountRpc(socket, async (method) => {
			if (method === "quota")
				return {
					fetchedAt: new Date(100),
					windows: [{ resetsAt: new Date(200) }],
				};
			if (method === "remove")
				throw new TRPCError({ code: "BAD_REQUEST", message: "active-account" });
			return accepted?.request("terminal", ["org-terminal"]);
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("missing port");
	const client = new AccountRpc(
		createConnection({ port: address.port, host: "127.0.0.1" }),
		async (_method, args) => args[0],
	);
	try {
		expect(await client.request<string>("switch")).toBe("org-terminal");
		const quota = await client.request<{
			fetchedAt: Date;
			windows: { resetsAt: Date }[];
		}>("quota");
		expect(quota.fetchedAt.getTime()).toBe(100);
		expect(quota.windows[0]?.resetsAt.getTime()).toBe(200);
		try {
			await client.request("remove");
			throw new Error("expected refusal");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("BAD_REQUEST");
		}
		client.socket.destroy();
		await expect(client.request("switch")).rejects.toThrow(
			"account-owner-disconnected",
		);
	} finally {
		client.socket.destroy();
		accepted?.socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
