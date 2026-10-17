import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { cacheResumedSuccessor } from "./cacheResumedSuccessor";

test("late pre-resume null cannot erase the confirmed successor", async () => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const key = ["terminal-resumed-successor", "workspace", "old-terminal"];
	const pending = Promise.withResolvers<null>();
	const oldLookup = client
		.fetchQuery({ queryKey: key, queryFn: () => pending.promise })
		.catch(() => undefined);
	const successor = { terminalId: "new-terminal", label: "Claude" };
	await cacheResumedSuccessor(client, key, successor);
	pending.resolve(null);
	await oldLookup;
	expect(client.getQueryData<typeof successor>(key)).toEqual(successor);
	client.clear();
});

test("cancels only the resumed terminal lookup", async () => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const pending = Promise.withResolvers<null>();
	const key = ["terminal-resumed-successor", "workspace", "other-terminal"];
	const otherLookup = client.fetchQuery({
		queryKey: key,
		queryFn: () => pending.promise,
	});
	await cacheResumedSuccessor(
		client,
		["terminal-resumed-successor", "workspace", "old-terminal"],
		{ terminalId: "new-terminal", label: "Claude" },
	);
	expect(client.getQueryState(key)?.fetchStatus).toBe("fetching");
	pending.resolve(null);
	expect(await otherLookup).toBeNull();
	client.clear();
});
