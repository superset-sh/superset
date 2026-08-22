import { describe, expect, it } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import type { ApiClient } from "../../lib/api-client";
import { resolveAutomationTarget } from "./resolveAutomationTarget";

function apiWithHosts(hostIds: string[]): ApiClient {
	return {
		host: {
			list: {
				query: async () => hostIds.map((id) => ({ id, name: id })),
			},
		},
	} as unknown as ApiClient;
}

const BASE = {
	organizationId: "org-1",
	userJwt: "jwt",
};

describe("resolveAutomationTarget host preflight", () => {
	it("rejects session mode when this machine is not registered", async () => {
		await expect(
			resolveAutomationTarget({ ...BASE, api: apiWithHosts([]) }),
		).rejects.toThrow(CLIError);
		await expect(
			resolveAutomationTarget({ ...BASE, api: apiWithHosts([]) }),
		).rejects.toThrow(/isn't registered with the cloud/);
	});

	it("rejects an explicit --host that is not registered", async () => {
		await expect(
			resolveAutomationTarget({
				...BASE,
				api: apiWithHosts(["some-other-host"]),
				hostId: "missing-host",
			}),
		).rejects.toThrow(/Host missing-host is not registered/);
	});

	it("allows session mode when this machine is registered", async () => {
		const target = await resolveAutomationTarget({
			...BASE,
			api: apiWithHosts([getHostId()]),
		});
		expect(target).toEqual({
			targetHostId: getHostId(),
			v2ProjectId: null,
		});
	});
});
