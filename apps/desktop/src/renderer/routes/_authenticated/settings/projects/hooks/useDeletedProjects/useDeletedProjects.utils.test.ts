import { expect, test } from "bun:test";
import { mergeDeletedProjects } from "./useDeletedProjects.utils";

test("merges copies of one project across devices, newest deletion first", () => {
	expect(
		mergeDeletedProjects([
			{
				hostId: "a",
				url: "a-url",
				rows: [
					{
						id: "p1",
						name: "One",
						deletedAt: 10,
						deletedByUserId: "ann",
						purgeAt: 110,
					},
					{
						id: "p2",
						name: "Two",
						deletedAt: 30,
						deletedByUserId: null,
						purgeAt: 130,
					},
				],
			},
			{
				hostId: "b",
				url: "b-url",
				rows: [
					{
						id: "p1",
						name: "One",
						deletedAt: 20,
						deletedByUserId: "bob",
						purgeAt: 120,
					},
				],
			},
		]),
	).toEqual([
		{
			id: "p2",
			name: "Two",
			deletedAt: 30,
			deletedByUserId: null,
			purgeAt: 130,
			hosts: [{ hostId: "a", url: "a-url" }],
		},
		{
			id: "p1",
			name: "One",
			deletedAt: 20,
			deletedByUserId: "bob",
			purgeAt: 110,
			hosts: [
				{ hostId: "a", url: "a-url" },
				{ hostId: "b", url: "b-url" },
			],
		},
	]);
});
