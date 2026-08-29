import { describe, expect, it } from "bun:test";
import {
	applyFolderTagChange,
	buildSidebarFolderKey,
	DERIVED_TAG_FOLDER_TAB_ORDER_BASE,
	deriveTagFolders,
	EMPTY_TAG_FOLDER_CONTEXT,
	getProjectFolderTagIndex,
	mintFolderTag,
	parseSidebarFolderKey,
	resolveWorkspaceFolder,
	resolveWorkspaceSectionId,
	type TagFolderSectionInput,
	type TagFolderWorkspaceInput,
} from "./workspaceTagFolders";

const PROJECT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeSection(
	overrides: Partial<TagFolderSectionInput> &
		Pick<TagFolderSectionInput, "sectionId">,
): TagFolderSectionInput {
	return {
		projectId: PROJECT_A,
		name: "Group",
		tabOrder: 1,
		isCollapsed: false,
		color: null,
		createdAt: new Date("2026-01-01"),
		tag: null,
		...overrides,
	};
}

function makeWorkspace(
	overrides: Partial<TagFolderWorkspaceInput> &
		Pick<TagFolderWorkspaceInput, "id">,
): TagFolderWorkspaceInput {
	return { projectId: PROJECT_A, tags: [], ...overrides };
}

describe("buildSidebarFolderKey / parseSidebarFolderKey", () => {
	it("round-trips", () => {
		const key = buildSidebarFolderKey(PROJECT_A, "perf work");
		expect(key).toBe(`${PROJECT_A}:perf work`);
		expect(parseSidebarFolderKey(key)).toEqual({
			projectId: PROJECT_A,
			tag: "perf work",
		});
	});

	it("splits at the FIRST colon so tags may contain colons", () => {
		expect(parseSidebarFolderKey(`${PROJECT_A}:area:perf`)).toEqual({
			projectId: PROJECT_A,
			tag: "area:perf",
		});
	});

	it("returns null for legacy uuid section ids", () => {
		expect(
			parseSidebarFolderKey("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
		).toBeNull();
	});

	it("returns null for null, undefined, and invalid tag halves", () => {
		expect(parseSidebarFolderKey(null)).toBeNull();
		expect(parseSidebarFolderKey(undefined)).toBeNull();
		expect(parseSidebarFolderKey(`${PROJECT_A}:`)).toBeNull();
		expect(parseSidebarFolderKey(`${PROJECT_A}:   `)).toBeNull();
		expect(parseSidebarFolderKey(":tag")).toBeNull();
	});

	it("normalizes the tag half on parse", () => {
		expect(parseSidebarFolderKey(`${PROJECT_A}: Perf `)).toEqual({
			projectId: PROJECT_A,
			tag: "perf",
		});
	});
});

describe("deriveTagFolders", () => {
	it("a folder exists because a workspace carries the tag, with no row anywhere", () => {
		const folders = deriveTagFolders(
			[],
			[makeWorkspace({ id: "w1", tags: ["perf"] })],

			EMPTY_TAG_FOLDER_CONTEXT,
		);
		expect(folders).toHaveLength(1);
		expect(folders[0]).toMatchObject({
			sectionId: buildSidebarFolderKey(PROJECT_A, "perf"),
			projectId: PROJECT_A,
			name: "perf",
			tag: "perf",
			isDerived: true,
			tabOrder: DERIVED_TAG_FOLDER_TAB_ORDER_BASE,
		});
	});

	it("stored rows pass through and suppress a duplicate derived folder", () => {
		const stored = makeSection({
			sectionId: buildSidebarFolderKey(PROJECT_A, "perf"),
			tag: "perf",
			tabOrder: 3,
			color: "#ff0000",
		});
		const folders = deriveTagFolders(
			[stored],
			[makeWorkspace({ id: "w1", tags: ["perf", "extra"] })],

			EMPTY_TAG_FOLDER_CONTEXT,
		);
		expect(folders).toHaveLength(2);
		expect(folders[0]).toMatchObject({
			sectionId: stored.sectionId,
			tag: "perf",
			isDerived: false,
			color: "#ff0000",
			tabOrder: 3,
		});
		expect(folders[1]).toMatchObject({ tag: "extra", isDerived: true });
	});

	it("derived folders sort by tag and stay per-project", () => {
		const folders = deriveTagFolders(
			[],
			[
				makeWorkspace({ id: "w1", tags: ["zeta", "alpha"] }),
				makeWorkspace({ id: "w2", projectId: PROJECT_B, tags: ["alpha"] }),
			],

			EMPTY_TAG_FOLDER_CONTEXT,
		);
		const projectAFolders = folders.filter((f) => f.projectId === PROJECT_A);
		expect(projectAFolders.map((f) => f.tag)).toEqual(["alpha", "zeta"]);
		expect(projectAFolders.map((f) => f.tabOrder)).toEqual([
			DERIVED_TAG_FOLDER_TAB_ORDER_BASE,
			DERIVED_TAG_FOLDER_TAB_ORDER_BASE + 1,
		]);
		expect(
			folders.filter((f) => f.projectId === PROJECT_B).map((f) => f.tag),
		).toEqual(["alpha"]);
	});

	it("session workspaces (null projectId) never derive folders", () => {
		expect(
			deriveTagFolders(
				[],
				[makeWorkspace({ id: "w1", projectId: null, tags: ["perf"] })],

				EMPTY_TAG_FOLDER_CONTEXT,
			),
		).toEqual([]);
	});

	it("a workspace row with the tags field ABSENT derives nothing and does not crash", () => {
		// Rows served by an older host (or an old IndexedDB snapshot) carry
		// the field absent, not null — the earlier attempt crashed here.
		const legacyRow = {
			id: "w1",
			projectId: PROJECT_A,
		} as TagFolderWorkspaceInput;
		expect(deriveTagFolders([], [legacyRow], EMPTY_TAG_FOLDER_CONTEXT)).toEqual(
			[],
		);
	});

	it("a section row with the tag field ABSENT is a legacy folder, not tag-backed", () => {
		const legacySection = {
			sectionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			projectId: PROJECT_A,
			name: "Old group",
			tabOrder: 1,
			isCollapsed: false,
			color: null,
			createdAt: new Date("2026-01-01"),
		} as TagFolderSectionInput;
		const folders = deriveTagFolders(
			[legacySection],
			[makeWorkspace({ id: "w1", tags: ["perf"] })],

			EMPTY_TAG_FOLDER_CONTEXT,
		);
		expect(folders[0]).toMatchObject({
			sectionId: legacySection.sectionId,
			tag: null,
			isDerived: false,
		});
		expect(folders[1]).toMatchObject({ tag: "perf", isDerived: true });
	});

	it("normalizes stored tags so `Perf` matches a workspace tagged `perf`", () => {
		const folders = deriveTagFolders(
			[
				makeSection({
					sectionId: buildSidebarFolderKey(PROJECT_A, "perf"),
					tag: "Perf",
				}),
			],
			[makeWorkspace({ id: "w1", tags: [" PERF "] })],

			EMPTY_TAG_FOLDER_CONTEXT,
		);
		expect(folders).toHaveLength(1);
		expect(folders[0]?.tag).toBe("perf");
	});
});

describe("getProjectFolderTagIndex", () => {
	it("indexes only the given project's tag-backed folders", () => {
		const sections = deriveTagFolders(
			[
				makeSection({ sectionId: "legacy-row", tag: null }),
				makeSection({
					sectionId: buildSidebarFolderKey(PROJECT_A, "perf"),
					tag: "perf",
					tabOrder: 2,
				}),
				makeSection({
					sectionId: buildSidebarFolderKey(PROJECT_B, "perf"),
					projectId: PROJECT_B,
					tag: "perf",
				}),
			],
			[],

			EMPTY_TAG_FOLDER_CONTEXT,
		);
		const index = getProjectFolderTagIndex(sections, PROJECT_A);
		expect([...index.keys()]).toEqual(["perf"]);
		expect(index.get("perf")?.sectionId).toBe(
			buildSidebarFolderKey(PROJECT_A, "perf"),
		);
	});

	it("duplicate tags keep the lowest tabOrder", () => {
		const index = getProjectFolderTagIndex(
			[
				makeSection({ sectionId: "high", tag: "perf", tabOrder: 9 }),
				makeSection({ sectionId: "low", tag: "perf", tabOrder: 1 }),
			],
			PROJECT_A,
		);
		expect(index.get("perf")?.sectionId).toBe("low");
	});
});

describe("resolveWorkspaceFolder", () => {
	const index = getProjectFolderTagIndex(
		[
			makeSection({ sectionId: "s-perf", tag: "perf", tabOrder: 2 }),
			makeSection({ sectionId: "s-infra", tag: "infra", tabOrder: 1 }),
		],
		PROJECT_A,
	);

	it("returns null when no tag has a folder", () => {
		expect(resolveWorkspaceFolder(["unrelated"], index)).toBeNull();
		expect(resolveWorkspaceFolder([], index)).toBeNull();
		expect(resolveWorkspaceFolder(null, index)).toBeNull();
		expect(resolveWorkspaceFolder(undefined, index)).toBeNull();
	});

	it("resolves through normalization", () => {
		expect(resolveWorkspaceFolder([" PERF "], index)?.sectionId).toBe("s-perf");
	});

	it("multiple matching tags: lowest tabOrder wins", () => {
		expect(resolveWorkspaceFolder(["perf", "infra"], index)?.sectionId).toBe(
			"s-infra",
		);
	});

	it("tabOrder tie: lexicographically smallest tag wins", () => {
		const tied = getProjectFolderTagIndex(
			[
				makeSection({ sectionId: "s-b", tag: "beta", tabOrder: 5 }),
				makeSection({ sectionId: "s-a", tag: "alpha", tabOrder: 5 }),
			],
			PROJECT_A,
		);
		expect(resolveWorkspaceFolder(["beta", "alpha"], tied)?.sectionId).toBe(
			"s-a",
		);
	});
});

describe("resolveWorkspaceSectionId", () => {
	const index = getProjectFolderTagIndex(
		[
			makeSection({
				sectionId: buildSidebarFolderKey(PROJECT_A, "perf"),
				tag: "perf",
			}),
		],
		PROJECT_A,
	);

	it("tags win over any local pointer", () => {
		expect(
			resolveWorkspaceSectionId({
				tags: ["perf"],
				localSectionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
				index,
			}),
		).toBe(buildSidebarFolderKey(PROJECT_A, "perf"));
	});

	it("no tags: a legacy uuid pointer stands", () => {
		expect(
			resolveWorkspaceSectionId({
				tags: [],
				localSectionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
				index,
			}),
		).toBe("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
	});

	it("a stale pointer at a tag-backed folder is ignored", () => {
		expect(
			resolveWorkspaceSectionId({
				tags: [],
				localSectionId: buildSidebarFolderKey(PROJECT_A, "perf"),
				index,
			}),
		).toBeNull();
	});

	it("handles absent tags and null/undefined localSectionId", () => {
		const legacyRow = {} as { tags?: string[]; sectionId?: string };
		expect(
			resolveWorkspaceSectionId({
				tags: legacyRow.tags,
				localSectionId: legacyRow.sectionId,
				index,
			}),
		).toBeNull();
		expect(
			resolveWorkspaceSectionId({ tags: null, localSectionId: null, index }),
		).toBeNull();
	});
});

describe("applyFolderTagChange", () => {
	const folderTags = ["perf", "infra"];

	it("replaces the project's folder tags with the target tag", () => {
		expect(
			applyFolderTagChange(["perf", "scratch"], folderTags, "infra"),
		).toEqual(["infra", "scratch"]);
	});

	it("only touches tags the project has a folder for", () => {
		// An agent's `--tag scratch` survives the user dragging between folders.
		expect(applyFolderTagChange(["scratch"], folderTags, "perf")).toEqual([
			"perf",
			"scratch",
		]);
	});

	it("null target strips folder membership only", () => {
		expect(applyFolderTagChange(["perf", "scratch"], folderTags, null)).toEqual(
			["scratch"],
		);
	});

	it("normalizes both sides of the comparison", () => {
		expect(applyFolderTagChange([" Perf "], ["PERF"], "Infra")).toEqual([
			"infra",
		]);
	});

	it("handles absent current tags", () => {
		const legacyRow = {} as { tags?: string[] };
		expect(applyFolderTagChange(legacyRow.tags, folderTags, "perf")).toEqual([
			"perf",
		]);
	});
});

describe("mintFolderTag", () => {
	it("normalizes the name into a tag", () => {
		expect(mintFolderTag("  Perf Work ", [])).toBe("perf work");
	});

	it("falls back to `group` for a name that can't be a tag", () => {
		expect(mintFolderTag("   ", [])).toBe("group");
		expect(mintFolderTag(null, [])).toBe("group");
		expect(mintFolderTag(undefined, [])).toBe("group");
	});

	it("suffixes -2, -3 on collisions", () => {
		expect(mintFolderTag("Perf", ["perf"])).toBe("perf-2");
		expect(mintFolderTag("Perf", ["perf", "perf-2"])).toBe("perf-3");
	});

	it("normalizes taken tags before comparing", () => {
		expect(mintFolderTag("perf", [" PERF "])).toBe("perf-2");
	});

	it("keeps collision suffixes within the tag length cap", () => {
		const base = "a".repeat(64);
		const minted = mintFolderTag(base, [base]);
		expect(minted.length).toBeLessThanOrEqual(64);
		expect(minted.endsWith("-2")).toBe(true);
	});
});

describe("deriveTagFolders with host settings and hidden folders", () => {
	it("host settings override name, color, and order on derived folders", () => {
		const folders = deriveTagFolders(
			[],
			[makeWorkspace({ id: "w1", tags: ["perf"] })],
			{
				tagSettings: [
					{
						projectId: PROJECT_A,
						tag: "Perf",
						displayName: "Perf Work",
						color: "#ff0000",
						tabOrder: 4,
					},
				],
				hiddenTagsByProject: new Map(),
			},
		);
		expect(folders[0]).toMatchObject({
			tag: "perf",
			name: "Perf Work",
			color: "#ff0000",
			tabOrder: 4,
		});
	});

	it("host settings beat the local row for what they define; the row keeps the rest", () => {
		const stored = makeSection({
			sectionId: buildSidebarFolderKey(PROJECT_A, "perf"),
			tag: "perf",
			name: "old label",
			color: "#00ff00",
			tabOrder: 2,
			isCollapsed: true,
		});
		const folders = deriveTagFolders([stored], [], {
			tagSettings: [
				{ projectId: PROJECT_A, tag: "perf", displayName: "New Label" },
			],
			hiddenTagsByProject: new Map(),
		});
		expect(folders[0]).toMatchObject({
			name: "New Label",
			color: "#00ff00",
			tabOrder: 2,
			isCollapsed: true,
		});
	});

	it("settings with absent optional fields change nothing they don't define", () => {
		const folders = deriveTagFolders(
			[],
			[makeWorkspace({ id: "w1", tags: ["perf"] })],
			{
				tagSettings: [{ projectId: PROJECT_A, tag: "perf" }],
				hiddenTagsByProject: new Map(),
			},
		);
		expect(folders[0]).toMatchObject({ name: "perf", color: null });
	});

	it("hidden tags leave the union entirely, stored row or not", () => {
		const stored = makeSection({
			sectionId: buildSidebarFolderKey(PROJECT_A, "perf"),
			tag: "perf",
		});
		const folders = deriveTagFolders(
			[stored],
			[makeWorkspace({ id: "w1", tags: ["perf", "infra"] })],
			{
				tagSettings: [],
				hiddenTagsByProject: new Map([[PROJECT_A, new Set(["perf"])]]),
			},
		);
		expect(folders.map((folder) => folder.tag)).toEqual(["infra"]);
	});

	it("a hidden folder's members resolve to top level", () => {
		const folders = deriveTagFolders(
			[],
			[makeWorkspace({ id: "w1", tags: ["perf"] })],
			{
				tagSettings: [],
				hiddenTagsByProject: new Map([[PROJECT_A, new Set(["perf"])]]),
			},
		);
		const index = getProjectFolderTagIndex(folders, PROJECT_A);
		expect(
			resolveWorkspaceSectionId({
				tags: ["perf"],
				localSectionId: null,
				index,
			}),
		).toBeNull();
	});

	it("hiding in one project does not hide the tag elsewhere; legacy rows are never hidden", () => {
		const legacy = makeSection({ sectionId: "legacy-row", tag: null });
		const folders = deriveTagFolders(
			[legacy],
			[
				makeWorkspace({ id: "w1", tags: ["perf"] }),
				makeWorkspace({ id: "w2", projectId: PROJECT_B, tags: ["perf"] }),
			],
			{
				tagSettings: [],
				hiddenTagsByProject: new Map([[PROJECT_A, new Set(["perf"])]]),
			},
		);
		expect(
			folders.map(
				(folder) =>
					`${folder.projectId === PROJECT_B ? "B" : "A"}:${folder.tag}`,
			),
		).toEqual(["A:null", "B:perf"]);
	});
});
