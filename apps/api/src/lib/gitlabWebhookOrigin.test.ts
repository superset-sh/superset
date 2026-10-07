import { expect, test } from "bun:test";
import {
	gitlabWebhookOriginSchema,
	resolveGitlabWebhookOrigin,
} from "./gitlabWebhookOrigin";

test("optional webhook origin uses API URL when absent or empty", () => {
	for (const origin of [undefined, ""]) {
		expect(gitlabWebhookOriginSchema.parse(origin)).toBeUndefined();
		expect(resolveGitlabWebhookOrigin(origin, "http://localhost:3001")).toBe(
			"http://localhost:3001",
		);
	}
});
test("dedicated HTTPS root origin is canonical and preserves custom port", () => {
	expect(
		resolveGitlabWebhookOrigin(
			"https://HOOKS.example:8443/",
			"https://api.example",
		),
	).toBe("https://hooks.example:8443");
});
test("dedicated origin rejects credentials, path, query, fragment and non-HTTPS", () => {
	for (const origin of [
		"http://hooks.example",
		"hooks.example",
		"https://user:pass@hooks.example",
		"https://hooks.example/path",
		"https://hooks.example/?token=secret",
		"https://hooks.example/#fragment",
		"https://hooks.example\\path",
		" https://hooks.example",
		" ",
		"https://hooks.example/../",
	]) {
		expect(gitlabWebhookOriginSchema.safeParse(origin).success).toBe(false);
	}
});
