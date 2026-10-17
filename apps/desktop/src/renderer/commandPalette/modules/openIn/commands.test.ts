import { describe, expect, test } from "bun:test";
import type { ExternalApp } from "@superset/local-db";
import type { CommandContext } from "../../core/types";
import { openInProvider } from "./commands";

function contextWith(preferredOpenInApp?: ExternalApp): CommandContext {
	return {
		route: { pathname: "/", params: {} },
		workspace: {
			id: "ws-1",
			name: "demo",
			projectId: "p-1",
			preferredOpenInApp,
		},
		activeHostUrl: "http://127.0.0.1:1",
		activeOrganizationId: null,
		activeOrganizationName: null,
		hostServiceStatus: "running",
		localMachineId: null,
		notificationSoundsMuted: false,
		isV2CloudEnabled: false,
		navigate: () => {},
		openNewWorkspace: () => {},
	};
}

function commandIds(context: CommandContext): string[] {
	return openInProvider.provide(context).map((command) => command.id);
}

describe("openInProvider", () => {
	test("offers the preferred app once it is resolved", () => {
		expect(commandIds(contextWith("zed"))).toEqual([
			"openIn.preferred:zed",
			"openIn.menu",
		]);
	});

	test("omits the preferred command while the app is unresolved", () => {
		expect(commandIds(contextWith(undefined))).toEqual(["openIn.menu"]);
	});
});
