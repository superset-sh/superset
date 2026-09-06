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
	checkLocalHost: async () => null,
};

function localHost(relayEnabled: boolean | null) {
	return async () => ({
		healthy: true,
		cloudRegistered: true,
		registrationError: null,
		relayEnabled,
	});
}

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

// A host with Remote Access off registers (so the preflight above passes)
// but never opens the relay, and every run would be skipped as offline —
// the CLI must say so, not create the automation (#7223).
describe("resolveAutomationTarget Remote Access preflight", () => {
	it("refuses this machine when its host-service reports the relay disabled", async () => {
		const promise = resolveAutomationTarget({
			...BASE,
			api: apiWithHosts([getHostId()]),
			checkLocalHost: localHost(false),
		});
		await expect(promise).rejects.toThrow(CLIError);
		await expect(promise).rejects.toThrow(
			/Remote Access is off for this machine/,
		);
		await expect(promise).rejects.toMatchObject({
			suggestion: expect.stringMatching(/Settings → Remote Access/),
		});
	});

	it("passes when the relay is enabled or its state is not settled yet", async () => {
		for (const relayEnabled of [true, null]) {
			await expect(
				resolveAutomationTarget({
					...BASE,
					api: apiWithHosts([getHostId()]),
					checkLocalHost: localHost(relayEnabled),
				}),
			).resolves.toEqual({ targetHostId: getHostId(), v2ProjectId: null });
		}
	});

	it("does not consult this machine for an explicit --host", async () => {
		await expect(
			resolveAutomationTarget({
				...BASE,
				api: apiWithHosts(["other-host"]),
				hostId: "other-host",
				checkLocalHost: localHost(false),
			}),
		).resolves.toEqual({ targetHostId: "other-host", v2ProjectId: null });
	});
});
