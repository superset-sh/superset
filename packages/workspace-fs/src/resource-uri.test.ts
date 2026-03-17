import { describe, expect, it } from "bun:test";
import {
	parseWorkspaceFsResourceUri,
	toWorkspaceFsResourceUri,
} from "./resource-uri";

describe("workspace fs resource uri", () => {
	it("round-trips a posix absolute path", () => {
		const resourceUri = toWorkspaceFsResourceUri({
			workspaceId: "workspace-1",
			absolutePath: "/tmp/project/src/index.ts",
		});

		expect(resourceUri).toEqual(
			"workspace-fs://workspace-1/tmp/project/src/index.ts",
		);
		expect(parseWorkspaceFsResourceUri(resourceUri)).toEqual({
			workspaceId: "workspace-1",
			absolutePath: "/tmp/project/src/index.ts",
		});
	});

	it("normalizes windows paths without requiring node:path", () => {
		const resourceUri = toWorkspaceFsResourceUri({
			workspaceId: "workspace-2",
			absolutePath: "C:\\Users\\Kietho\\project\\.\\src\\..\\README.md",
		});

		expect(resourceUri).toEqual(
			"workspace-fs://workspace-2/c%3A/Users/Kietho/project/README.md",
		);
		expect(parseWorkspaceFsResourceUri(resourceUri)).toEqual({
			workspaceId: "workspace-2",
			absolutePath: "c:/Users/Kietho/project/README.md",
		});
	});
});
