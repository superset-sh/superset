import { describe, expect, test } from "bun:test";
import {
	type AccountSwitchGroup,
	getAccountSwitchGroups,
} from "./getAccountSwitchGroups";

const workspace = {
	workspaceId: "workspace-1",
	workspaceName: "Fix the login page",
	paneLayout: null,
};

const remoteGroup: AccountSwitchGroup = {
	hostUrl: "https://relay.example/hosts/org_1.host_2",
	workspaces: [workspace],
};

describe("getAccountSwitchGroups", () => {
	test("subscribes the local host even when no workspace of its own is visible", () => {
		expect(
			getAccountSwitchGroups({
				hostGroups: [remoteGroup],
				activeHostUrl: "http://127.0.0.1:7777",
			}),
		).toEqual([
			remoteGroup,
			{ hostUrl: "http://127.0.0.1:7777", workspaces: [] },
		]);
	});

	test("does not subscribe the local host twice when it already has workspaces", () => {
		const localGroup: AccountSwitchGroup = {
			hostUrl: "http://127.0.0.1:7777",
			workspaces: [workspace],
		};

		expect(
			getAccountSwitchGroups({
				hostGroups: [localGroup, remoteGroup],
				activeHostUrl: "http://127.0.0.1:7777",
			}),
		).toEqual([localGroup, remoteGroup]);
	});

	test("leaves the groups alone when there is no local host", () => {
		expect(
			getAccountSwitchGroups({
				hostGroups: [remoteGroup],
				activeHostUrl: null,
			}),
		).toEqual([remoteGroup]);
	});
});
