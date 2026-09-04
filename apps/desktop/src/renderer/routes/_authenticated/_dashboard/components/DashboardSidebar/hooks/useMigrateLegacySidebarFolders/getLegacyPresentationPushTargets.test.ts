import { describe, expect, test } from "bun:test";
import type {
	HostTagFolderSetting,
	HostTagFoldersResult,
} from "renderer/hooks/host-projects/useHostTagFolders";
import { getLegacyPresentationPushTargets } from "./getLegacyPresentationPushTargets";

const PROJECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const folder: HostTagFolderSetting = {
	scope: PROJECT,
	tag: "api",
	displayName: null,
	color: "#ff0000",
	tabOrder: null,
};

function host(
	machineId: string,
	status: HostTagFoldersResult["status"],
	settings: HostTagFolderSetting[] = [],
): HostTagFoldersResult {
	return {
		target: {
			machineId,
			organizationId: "org",
			hostUrl: status === "offline" ? null : `http://${machineId}`,
			isLocal: machineId === "local",
		},
		status,
		settings,
	};
}

describe("getLegacyPresentationPushTargets", () => {
	test("pushes only to ready serving hosts missing the row", () => {
		const targets = getLegacyPresentationPushTargets({
			hostIds: ["local", "has-row", "failed", "pending", "offline"],
			scope: PROJECT,
			tag: "api",
			hostResults: [
				host("local", "ready"),
				host("has-row", "ready", [folder]),
				host("failed", "error"),
				host("pending", "pending"),
				host("offline", "offline"),
				host("unrelated", "ready"),
			],
		});
		expect(targets).toEqual([{ machineId: "local", hostUrl: "http://local" }]);
	});

	test("does not let one replica's row suppress a missing replica", () => {
		const targets = getLegacyPresentationPushTargets({
			hostIds: ["alpha", "beta"],
			scope: PROJECT,
			tag: "api",
			hostResults: [host("alpha", "ready", [folder]), host("beta", "ready")],
		});
		expect(targets).toEqual([{ machineId: "beta", hostUrl: "http://beta" }]);
	});
});
