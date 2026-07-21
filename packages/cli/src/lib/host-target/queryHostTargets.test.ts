import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ApiClient } from "../api-client";
import type { HostServiceClient } from "./resolveHostTarget";

const LOCAL_HOST_ID = "local-host";

let discoveredHosts: Array<{ id: string; name: string; online: boolean }> = [];
let discoveryError: Error | undefined;
let localManifestLive = false;

const hostListQuery = mock(async () => {
	if (discoveryError) throw discoveryError;
	return discoveredHosts;
});

const clients = new Map<string, HostServiceClient>();
const resolveHostTarget = mock(
	({ requestedHostId }: { requestedHostId: string }) => {
		const client = clients.get(requestedHostId);
		if (!client) throw new Error(`missing client for ${requestedHostId}`);
		return { client };
	},
);

mock.module("@superset/shared/host-info", () => ({
	getHostId: () => LOCAL_HOST_ID,
}));

mock.module("../host/manifest", () => ({
	isProcessAlive: () => localManifestLive,
	readManifest: () => (localManifestLive ? { pid: 1234 } : null),
}));

mock.module("./resolveHostTarget", () => ({ resolveHostTarget }));

const { queryHostTargets } = await import("./queryHostTargets");

function createApi(): ApiClient {
	return {
		host: { list: { query: hostListQuery } },
	} as unknown as ApiClient;
}

function addClient(hostId: string): HostServiceClient {
	const client = { hostId } as unknown as HostServiceClient;
	clients.set(hostId, client);
	return client;
}

const options = {
	api: createApi(),
	organizationId: "org-1",
	userJwt: "jwt-1",
};

beforeEach(() => {
	discoveredHosts = [];
	discoveryError = undefined;
	localManifestLive = false;
	clients.clear();
	hostListQuery.mockClear();
	resolveHostTarget.mockClear();
});

describe("queryHostTargets", () => {
	test("restricts an explicit query to the requested host", async () => {
		discoveredHosts = [
			{ id: "host-a", name: "Alpha", online: true },
			{ id: "host-b", name: "Beta", online: true },
		];
		addClient("host-b");

		const result = await queryHostTargets(
			{ ...options, hostId: "host-b" },
			async (client) => (client as unknown as { hostId: string }).hostId,
		);

		expect(result.results).toMatchObject([
			{ hostId: "host-b", hostName: "Beta", value: "host-b" },
		]);
		expect(resolveHostTarget).toHaveBeenCalledTimes(1);
		expect(result.warnings).toEqual([]);
	});

	test("falls back to the local host when cloud discovery fails", async () => {
		discoveryError = new Error("network down");
		addClient(LOCAL_HOST_ID);

		const result = await queryHostTargets(options, async () => "ok");

		expect(result.results).toMatchObject([
			{ hostId: LOCAL_HOST_ID, hostName: LOCAL_HOST_ID, value: "ok" },
		]);
		expect(result.warnings).toEqual([
			"Cloud host discovery failed (network down); checking this machine's host only",
		]);
	});

	test("includes a live local manifest alongside online discovered hosts", async () => {
		discoveredHosts = [{ id: "remote-host", name: "Remote", online: true }];
		localManifestLive = true;
		addClient("remote-host");
		addClient(LOCAL_HOST_ID);

		const result = await queryHostTargets(
			options,
			async (client) => (client as unknown as { hostId: string }).hostId,
		);

		expect(result.results.map(({ hostId }) => hostId)).toEqual([
			"remote-host",
			LOCAL_HOST_ID,
		]);
		expect(result.warnings).toEqual([]);
	});

	test("keeps successful hosts when another host query rejects", async () => {
		discoveredHosts = [
			{ id: "host-a", name: "Alpha", online: true },
			{ id: "host-b", name: "Beta", online: true },
		];
		addClient("host-a");
		addClient("host-b");

		const result = await queryHostTargets(options, async (client) => {
			const hostId = (client as unknown as { hostId: string }).hostId;
			if (hostId === "host-b") throw new Error("connection refused");
			return hostId;
		});

		expect(result.results).toMatchObject([
			{ hostId: "host-a", hostName: "Alpha", value: "host-a" },
		]);
		expect(result.warnings).toEqual([
			"Host Beta unreachable: connection refused",
		]);
	});

	test("does not query when every discovered host is offline", async () => {
		discoveredHosts = [
			{ id: "host-a", name: "Alpha", online: false },
			{ id: "host-b", name: "Beta", online: false },
		];
		const query = mock(async () => "unreachable");

		const result = await queryHostTargets(options, query);

		expect(result.results).toEqual([]);
		expect(query).not.toHaveBeenCalled();
		expect(resolveHostTarget).not.toHaveBeenCalled();
		expect(result.warnings).toEqual([
			"No hosts are currently online; nothing to query",
		]);
	});
});
