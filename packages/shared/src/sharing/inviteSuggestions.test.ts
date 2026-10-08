import { describe, expect, test } from "bun:test";
import { inviteSuggestions, pickableIndexes } from "./inviteSuggestions";
import type { ShareDirectory, ShareGrantee } from "./types";

const kenji = {
	userId: "kt",
	name: "Kenji Tanaka",
	email: "kenji@acme.dev",
	image: null,
};

const directory: ShareDirectory = {
	members: [
		{ userId: "mr", name: "Maya Rivera", email: "maya@acme.dev", image: null },
		{ userId: "do", name: "Dev Okafor", email: "dev@acme.dev", image: null },
		{
			userId: "kt",
			name: "Kenji Tanaka",
			email: "kenji@acme.dev",
			image: null,
		},
	],
	teams: [{ teamId: "design", name: "Design", memberIds: ["do"] }],
	domains: ["acme.dev", "gmail.com"],
};

const grantees: ShareGrantee[] = [
	{
		kind: "user",
		userId: "do",
		name: "Dev Okafor",
		email: "dev@acme.dev",
		image: null,
		role: null,
	},
	{
		kind: "invitation",
		invitationId: "i1",
		email: "sam@studio.design",
		role: null,
	},
];

const suggest = (
	query: string,
	overrides: Partial<Parameters<typeof inviteSuggestions>[0]> = {},
) =>
	inviteSuggestions({
		query,
		directory,
		grantees,
		staged: [],
		ownerId: "mr",
		inviteNew: "allowed",
		...overrides,
	});

describe("inviteSuggestions", () => {
	test("members who already have access stay listed but can't be picked", () => {
		const items = suggest("k");
		expect(items.map((i) => i.kind)).toEqual(["member", "member"]);
		expect(items[0]).toMatchObject({
			person: { userId: "do" },
			hasAccess: true,
		});
		expect(pickableIndexes(items)).toEqual([1]);
	});

	test("the owner counts as having access", () => {
		expect(suggest("maya")[0]).toMatchObject({ hasAccess: true });
	});

	test("teams match by name and come before people", () => {
		expect(suggest("de").map((i) => i.kind)).toEqual(["team", "member"]);
	});

	test("an address being typed offers completions, the org domain first", () => {
		const items = suggest("ana@");
		expect(items[0]).toEqual({ kind: "heading" });
		expect(items.slice(1).map((i) => i.kind === "invite" && i.email)).toEqual([
			"ana@acme.dev",
			"ana@gmail.com",
		]);
	});

	test("completions narrow by the typed domain and skip existing members", () => {
		expect(suggest("dev@").filter((i) => i.kind === "invite")).toEqual([
			{
				kind: "invite",
				email: "dev@gmail.com",
				completion: true,
				invited: false,
			},
		]);
		expect(suggest("ana@g").filter((i) => i.kind === "invite")).toHaveLength(1);
	});

	test("a full address becomes one invite, marked when already invited", () => {
		expect(suggest("Ana@Globex.com")).toEqual([
			{
				kind: "invite",
				email: "ana@globex.com",
				completion: false,
				invited: false,
			},
		]);
		expect(suggest("sam@studio.design")[0]).toMatchObject({ invited: true });
	});

	test("an address that can't be completed stays as a row that explains itself", () => {
		expect(suggest("sam@studio")).toEqual([
			{ kind: "invalid", text: "sam@studio" },
		]);
	});

	test("without permission to invite, one row says so instead", () => {
		expect(suggest("ana@", { inviteNew: "admins-only" })).toEqual([
			{ kind: "blocked" },
		]);
	});

	test("staged picks drop out of the list", () => {
		const items = suggest("kenji", {
			staged: [{ kind: "user", person: kenji }],
		});
		expect(items.every((i) => i.kind !== "member")).toBe(true);
	});

	test("no match and no address yet says nothing matched", () => {
		expect(suggest("zz z")).toEqual([{ kind: "empty" }]);
	});

	test("an empty query lists nothing, or everyone when browsing", () => {
		expect(suggest("")).toEqual([]);
		expect(
			suggest("", { browse: true }).map((i) =>
				i.kind === "team"
					? i.team.name
					: i.kind === "member"
						? i.person.name
						: i.kind,
			),
		).toEqual(["Design", "Maya Rivera", "Dev Okafor", "Kenji Tanaka"]);
	});
});
