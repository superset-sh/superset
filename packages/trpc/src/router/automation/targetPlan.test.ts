import { describe, expect, it } from "bun:test";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import {
	type AutomationTarget,
	NO_TARGET,
	needsLegacyWorkspace,
	newCloudPin,
	planTarget,
} from "./targetPlan";

const HOST = "machine-a";
const OTHER_HOST = "machine-b";
const PROJECT = "project-1";
const WORKSPACE = "workspace-1";
const BOX = "box-1";
const OTHER_BOX = "box-2";
const ENV = "env-1";
const OTHER_ENV = "env-2";

const onHost: AutomationTarget = {
	...NO_TARGET,
	targetHostId: HOST,
	v2ProjectId: PROJECT,
	v2WorkspaceId: WORKSPACE,
	continueAgentSession: true,
};

const pinnedInCloud: AutomationTarget = {
	...NO_TARGET,
	targetHostId: CLOUD_HOST_ID,
	cloudWorkspaceId: BOX,
	environmentId: ENV,
	continueAgentSession: true,
};

describe("planTarget on a host", () => {
	it("keeps everything when the input names no target", () => {
		const plan = planTarget(onHost, {}, {});
		expect(plan.target).toEqual(onHost);
		expect(plan.hostsToVerify).toEqual([]);
		expect(plan.cloud).toBeNull();
	});

	it("drops the workspace pin, and the session with it, when the host changes", () => {
		const plan = planTarget(onHost, { targetHostId: OTHER_HOST }, {});
		expect(plan.target).toMatchObject({
			targetHostId: OTHER_HOST,
			v2ProjectId: PROJECT,
			v2WorkspaceId: null,
			continueAgentSession: false,
		});
		expect(plan.hostsToVerify).toEqual([OTHER_HOST]);
	});

	it("takes the project a denormalized pin names", () => {
		const plan = planTarget(
			onHost,
			{ targetHostId: HOST, v2WorkspaceId: "workspace-2", v2ProjectId: null },
			{},
		);
		expect(plan.target).toMatchObject({
			v2WorkspaceId: "workspace-2",
			v2ProjectId: null,
		});
	});

	it("resolves a legacy retarget from the looked-up workspace and verifies its host", () => {
		const input = { v2WorkspaceId: "workspace-3" };
		expect(needsLegacyWorkspace(input)).toBe(true);
		const plan = planTarget(onHost, input, {
			legacyWorkspace: { projectId: "project-2", hostId: OTHER_HOST },
		});
		expect(plan.target).toMatchObject({
			targetHostId: OTHER_HOST,
			v2ProjectId: "project-2",
			v2WorkspaceId: "workspace-3",
		});
		expect(plan.hostsToVerify).toEqual([OTHER_HOST]);
	});

	it("refuses a legacy retarget that names a different project", () => {
		expect(() =>
			planTarget(
				onHost,
				{ v2WorkspaceId: "workspace-3", v2ProjectId: "project-9" },
				{ legacyWorkspace: { projectId: "project-2", hostId: HOST } },
			),
		).toThrow("does not match the workspace's project");
	});

	it("refuses cloud fields", () => {
		expect(() => planTarget(onHost, { cloudWorkspaceId: BOX }, {})).toThrow(
			'cloudWorkspaceId needs targetHostId "cloud"',
		);
		expect(() => planTarget(onHost, { environmentId: ENV }, {})).toThrow(
			'environmentId needs targetHostId "cloud"',
		);
	});
});

describe("planTarget in the cloud", () => {
	it("clears the host's project and pin when switching to the cloud", () => {
		const plan = planTarget(
			onHost,
			{ targetHostId: CLOUD_HOST_ID, environmentId: ENV },
			{},
		);
		expect(plan.target).toEqual({
			...NO_TARGET,
			targetHostId: CLOUD_HOST_ID,
			environmentId: ENV,
		});
		expect(plan.hostsToVerify).toEqual([]);
		expect(plan.cloud).toEqual({ environmentToVerify: ENV });
	});

	it("keeps the pin, environment and session when saving something else", () => {
		const plan = planTarget(pinnedInCloud, {}, {});
		expect(plan.target).toEqual(pinnedInCloud);
		expect(plan.cloud).toEqual({ environmentToVerify: null });
	});

	it("takes a new pin's environment unless one is named", () => {
		const input = { cloudWorkspaceId: OTHER_BOX };
		expect(newCloudPin(pinnedInCloud, input)).toBe(OTHER_BOX);
		const plan = planTarget(pinnedInCloud, input, {
			pinEnvironmentId: OTHER_ENV,
		});
		expect(plan.target).toMatchObject({
			cloudWorkspaceId: OTHER_BOX,
			environmentId: OTHER_ENV,
		});
		expect(plan.cloud).toEqual({ environmentToVerify: null });

		const named = planTarget(
			pinnedInCloud,
			{ cloudWorkspaceId: OTHER_BOX, environmentId: ENV },
			{ pinEnvironmentId: OTHER_ENV },
		);
		expect(named.target.environmentId).toBe(ENV);
	});

	it("is not a new pin when the same box is sent again", () => {
		expect(newCloudPin(pinnedInCloud, { cloudWorkspaceId: BOX })).toBeNull();
	});

	it("unpinning keeps the environment and ends the session", () => {
		const plan = planTarget(pinnedInCloud, { cloudWorkspaceId: null }, {});
		expect(plan.target).toMatchObject({
			cloudWorkspaceId: null,
			environmentId: ENV,
			continueAgentSession: false,
		});
	});

	it("needs a pin or an environment", () => {
		expect(() =>
			planTarget(
				pinnedInCloud,
				{ cloudWorkspaceId: null, environmentId: null },
				{},
			),
		).toThrow("needs an environment or a cloud workspace");
		expect(() =>
			planTarget(onHost, { targetHostId: CLOUD_HOST_ID }, {}),
		).toThrow("needs an environment or a cloud workspace");
	});

	it("refuses host fields", () => {
		expect(() =>
			planTarget(pinnedInCloud, { v2ProjectId: PROJECT }, {}),
		).toThrow("v2ProjectId does not apply to a cloud automation");
		expect(() =>
			planTarget(
				NO_TARGET,
				{
					targetHostId: CLOUD_HOST_ID,
					v2WorkspaceId: WORKSPACE,
					environmentId: ENV,
				},
				{},
			),
		).toThrow("v2WorkspaceId does not apply to a cloud automation");
	});

	it("reads a workspace id alone as a legacy host retarget, not a cloud pin", () => {
		const plan = planTarget(
			pinnedInCloud,
			{ v2WorkspaceId: WORKSPACE },
			{ legacyWorkspace: { projectId: PROJECT, hostId: HOST } },
		);
		expect(plan.target).toMatchObject({
			targetHostId: HOST,
			v2WorkspaceId: WORKSPACE,
			cloudWorkspaceId: null,
			environmentId: null,
		});
		expect(plan.hostsToVerify).toEqual([HOST]);
	});

	it("clears the cloud fields when switching back to a host", () => {
		const plan = planTarget(pinnedInCloud, { targetHostId: HOST }, {});
		expect(plan.target).toEqual({ ...NO_TARGET, targetHostId: HOST });
		expect(plan.hostsToVerify).toEqual([HOST]);
	});
});

describe("planTarget for a new automation", () => {
	it("pins a cloud workspace and takes its environment", () => {
		const plan = planTarget(
			NO_TARGET,
			{
				targetHostId: CLOUD_HOST_ID,
				cloudWorkspaceId: BOX,
				continueAgentSession: true,
			},
			{ pinEnvironmentId: ENV },
		);
		expect(plan.target).toEqual(pinnedInCloud);
	});

	it("refuses continuing a session with no pin", () => {
		expect(() =>
			planTarget(
				NO_TARGET,
				{
					targetHostId: CLOUD_HOST_ID,
					environmentId: ENV,
					continueAgentSession: true,
				},
				{},
			),
		).toThrow("requires a pinned workspace");
		expect(() =>
			planTarget(
				NO_TARGET,
				{ targetHostId: HOST, continueAgentSession: true },
				{},
			),
		).toThrow("requires a pinned workspace");
	});
});
