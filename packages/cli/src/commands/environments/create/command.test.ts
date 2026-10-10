import { expect, test } from "bun:test";
import createCommand from "./command";

async function invoke(provider?: "vercel" | "freestyle", region?: string) {
	let input: Record<string, unknown> | undefined;
	await createCommand.run({
		ctx: {
			config: { organizationId: "org-1" },
			api: {
				integration: {
					github: {
						listRepositories: {
							query: async () => [{ id: "repo-1", fullName: "org/repo" }],
						},
					},
				},
				environment: {
					create: {
						mutate: async (value: Record<string, unknown>) => {
							input = value;
							return { id: "env-1" };
						},
					},
					get: {
						query: async () => ({
							id: "env-1",
							name: "Test",
							region: "default",
						}),
					},
				},
			},
		} as never,
		args: {} as never,
		options: { name: "Test", repo: ["org/repo"], provider, region } as never,
		signal: new AbortController().signal,
	});
	return input;
}

test("old clients and the default CLI path omit provider", async () => {
	expect(await invoke()).not.toHaveProperty("provider");
});
test("an explicit Freestyle selection reaches the environment API", async () => {
	expect(await invoke("freestyle")).toHaveProperty("provider", "freestyle");
});
test("Freestyle rejects a Vercel region before making API calls", async () => {
	await expect(invoke("freestyle", "iad1")).rejects.toThrow("region override");
});
