import { expect, test } from "bun:test";
import type { ApiClient } from "../../../lib/api-client";
import { createCloudWorkspace } from "./createCloudWorkspace";

test.each([
	"local",
	"worktree",
	"invalid",
])("rejects checkout %s before contacting cloud", async (checkout) => {
	let contacted = false;
	const api = new Proxy(
		{},
		{
			get() {
				contacted = true;
				throw new Error("Unexpected cloud request");
			},
		},
	) as ApiClient;
	await expect(
		createCloudWorkspace({ api, organizationId: "org", options: { checkout } }),
	).rejects.toThrow("--checkout does not apply to --cloud");
	expect(contacted).toBe(false);
});
