import { describe, expect, test } from "bun:test";
import type { HostServiceClient } from "../host-target";
import { resolveSection } from "./resolveSection";

const SECTION_A = {
	id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	projectId: "proj-1",
	name: "Bugs",
	color: null,
	tabOrder: 1,
	createdAt: 1,
	updatedAt: 1,
};
const SECTION_B = {
	...SECTION_A,
	id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	projectId: "proj-2",
	name: "bugs",
};

function makeClient(sections: Array<typeof SECTION_A>) {
	return {
		sections: {
			list: {
				query: async (input?: { projectId?: string }) =>
					input?.projectId
						? sections.filter(
								(section) => section.projectId === input.projectId,
							)
						: sections,
			},
		},
	} as unknown as HostServiceClient;
}

describe("resolveSection", () => {
	test("resolves by UUID", async () => {
		const section = await resolveSection(
			makeClient([SECTION_A, SECTION_B]),
			SECTION_A.id,
		);
		expect(section.id).toBe(SECTION_A.id);
	});

	test("throws for an unknown UUID", async () => {
		await expect(
			resolveSection(
				makeClient([SECTION_A]),
				"99999999-9999-4999-8999-999999999999",
			),
		).rejects.toThrow("Group not found");
	});

	test("resolves a unique name case-insensitively", async () => {
		const section = await resolveSection(makeClient([SECTION_A]), "BUGS");
		expect(section.id).toBe(SECTION_A.id);
	});

	test("throws on ambiguous names without a project scope", async () => {
		await expect(
			resolveSection(makeClient([SECTION_A, SECTION_B]), "bugs"),
		).rejects.toThrow("ambiguous");
	});

	test("project scope disambiguates same-named groups", async () => {
		const section = await resolveSection(
			makeClient([SECTION_A, SECTION_B]),
			"bugs",
			"proj-2",
		);
		expect(section.id).toBe(SECTION_B.id);
	});

	test("throws for a missing name", async () => {
		await expect(
			resolveSection(makeClient([SECTION_A]), "nope"),
		).rejects.toThrow("Group not found");
	});
});
