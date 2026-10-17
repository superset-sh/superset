import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { resumeWithSuccessorRecovery } from "./resumeWithSuccessorRecovery";

test("a lost response follows the durable successor without retrying the resume", async () => {
	const client = new QueryClient();
	const key = ["terminal-resumed-successor", "workspace", "connected-source"];
	const successor = { terminalId: "durable-target", label: "Claude" };
	let attempts = 0;
	let lookups = 0;
	try {
		await resumeWithSuccessorRecovery(
			client,
			key,
			async () => {
				attempts++;
				throw TRPCClientError.from(new TypeError("Failed to fetch"));
			},
			async () => {
				lookups++;
				return successor;
			},
		);
		expect(client.getQueryData<typeof successor>(key)).toEqual(successor);
		expect(attempts).toBe(1);
		expect(lookups).toBe(1);
	} finally {
		client.clear();
	}
});

test("a failed resume without an authoritative successor keeps its original error", async () => {
	const client = new QueryClient();
	const key = ["terminal-resumed-successor", "workspace", "source"];
	const failure = new Error("history changed");
	try {
		await expect(
			resumeWithSuccessorRecovery(
				client,
				key,
				async () => {
					throw failure;
				},
				async () => null,
			),
		).rejects.toBe(failure);
		expect(client.getQueryData(key)).toBeUndefined();
	} finally {
		client.clear();
	}
});

test("a definitive account rejection cannot recover another account's successor", async () => {
	const client = new QueryClient();
	const key = ["terminal-resumed-successor", "workspace", "source"];
	const failure = TRPCClientError.from({
		error: {
			message: "Source revision changed while selecting account B",
			code: -32009,
			data: { code: "CONFLICT" },
		},
	});
	let lookups = 0;
	try {
		await expect(
			resumeWithSuccessorRecovery(
				client,
				key,
				async () => {
					throw failure;
				},
				async () => {
					lookups++;
					return {
						terminalId: "account-A-successor",
						label: "Claude — account A",
					};
				},
			),
		).rejects.toBe(failure);
		expect(lookups).toBe(0);
		expect(client.getQueryData(key)).toBeUndefined();
	} finally {
		client.clear();
	}
});
