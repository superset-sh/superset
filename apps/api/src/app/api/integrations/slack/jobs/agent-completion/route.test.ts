import { beforeEach, expect, mock, test } from "bun:test";

const verify = mock(
	async (
		_request: Request,
		_body: string,
		_path: string,
	): Promise<Response | null> => null,
);
const processCompletion = mock(async (_args: { launchId: string }) => {});
mock.module("@/lib/verifyQstash", () => ({ verifyQstashRequest: verify }));
mock.module("../../events/process-agent-completion", () => ({
	processAgentCompletion: processCompletion,
}));
// Every file that mocks this module must declare its full export set: bun
// links a module's export names once per process.
mock.module("../../events/utils/agent-launches", () => ({
	COMPLETION_JOB_PATH: "/api/integrations/slack/jobs/agent-completion",
	completionCheckDelaySeconds: () => 30,
	hostLaunchesFromActions: () => [],
	recordAgentLaunches: async () => {},
	scheduleCompletionCheck: async () => {},
}));
const route = await import("./route");

beforeEach(() => {
	verify.mockClear();
	processCompletion.mockClear();
});

test("verifies the queue signature for its own path before parsing", async () => {
	verify.mockImplementationOnce(async () =>
		Response.json({ error: "Invalid signature" }, { status: 401 }),
	);
	const result = await route.POST(
		new Request("http://localhost/job", { method: "POST", body: "invalid" }),
	);
	expect(result.status).toBe(401);
	expect(verify.mock.calls[0]?.[2]).toBe(
		"/api/integrations/slack/jobs/agent-completion",
	);
	expect(processCompletion).not.toHaveBeenCalled();
});

test("rejects malformed JSON and payloads without a launch id", async () => {
	for (const body of ["invalid", "null", "{}", '{"launchId":"nope"}']) {
		const result = await route.POST(
			new Request("http://localhost/job", { method: "POST", body }),
		);
		expect(result.status).toBe(400);
	}
	expect(processCompletion).not.toHaveBeenCalled();
});

test("hands a valid launch id to the completion check", async () => {
	const launchId = "3f2b7a4e-9c1d-4e8f-a6b5-1234567890ab";
	const result = await route.POST(
		new Request("http://localhost/job", {
			method: "POST",
			body: JSON.stringify({ launchId }),
		}),
	);
	expect(result.status).toBe(200);
	expect(processCompletion).toHaveBeenCalledWith({ launchId });
});
