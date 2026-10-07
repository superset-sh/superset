import { expect, test } from "bun:test";
import { safeGitLabStream } from "./stream-transport";

const limits = {
	timeoutMs: 5000,
	maxRequestBytes: 32 * 1024 * 1024,
	maxResponseBytes: 32 * 1024 * 1024,
};
test("invalid stream budgets fail before DNS or request body consumption", async () => {
	let resolutions = 0;
	let consumed = 0;
	const body = new ReadableStream<Uint8Array>(
		{
			pull: () => {
				consumed++;
			},
		},
		{ highWaterMark: 0 },
	);
	for (const invalid of [
		{ maxRequestBytes: 0 },
		{ maxResponseBytes: -1 },
		{ timeoutMs: Number.NaN },
		{ timeoutMs: 2_147_483_648 },
		{ contentLength: limits.maxRequestBytes + 1 },
		{ contentLength: -1 },
	]) {
		await expect(
			safeGitLabStream(
				"https://fixture.test/upload",
				{
					method: "POST",
					body,
				},
				{
					...limits,
					...invalid,
					resolve: async () => {
						resolutions++;
						return [];
					},
				},
			),
		).rejects.toThrow("Invalid GitLab streaming limit");
	}
	expect(resolutions).toBe(0);
	expect(consumed).toBe(0);
});
test("caller framing and authority fail before credential-bearing transport", async () => {
	let resolutions = 0;
	for (const name of [
		"host",
		"connection",
		"content-length",
		"transfer-encoding",
		"proxy-authorization",
	]) {
		await expect(
			safeGitLabStream(
				"https://fixture.test/upload",
				{
					headers: {
						[name]: "caller-value",
						Authorization: "Bearer FIXTURE_TOKEN",
					},
				},
				{
					...limits,
					resolve: async () => {
						resolutions++;
						return [];
					},
				},
			),
		).rejects.toThrow("Unsupported GitLab streaming header");
	}
	expect(resolutions).toBe(0);
});
test("DNS deadline and pre-aborted calls do not open a socket or disclose reasons", async () => {
	const options = {
		...limits,
		timeoutMs: 20,
		resolve: () => new Promise<never>(() => {}),
	};
	await expect(
		safeGitLabStream(
			"https://fixture.test/private?token=FIXTURE_TOKEN",
			{},
			options,
		),
	).rejects.toThrow("GitLab streaming request failed");
	const controller = new AbortController();
	controller.abort(new Error("FIXTURE_PRIVATE_BODY"));
	await expect(
		safeGitLabStream(
			"https://fixture.test/private",
			{ signal: controller.signal },
			limits,
		),
	).rejects.toThrow("GitLab streaming request failed");
});
