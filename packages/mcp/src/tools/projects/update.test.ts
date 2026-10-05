import { expect, test } from "bun:test";

import {
	type ProjectCollectionCall,
	updateProjectCollection,
} from "./update-utils";

const PROJECT_ID = "b502bf30-8693-4815-be65-795035e0ce5f";
const options = {
	relayUrl: "https://relay.example.com",
	organizationId: "org-1",
	hostId: "host-1",
	jwt: "token",
};

test("resolves a collection display name before setting its tag", async () => {
	const requests: Array<{ procedure: string; method: string; input: unknown }> =
		[];

	await updateProjectCollection(
		{ hostId: "host-1", id: PROJECT_ID, collection: "Client work" },
		options,
		(async (_options, procedure, method, input) => {
			requests.push({ procedure, method, input });
			if (procedure === "tagFolders.list") {
				return [
					{
						scope: "projects",
						tag: "dibsteur",
						displayName: "Client work",
					},
				];
			}
			return {};
		}) as ProjectCollectionCall,
	);

	expect(requests).toEqual([
		{ procedure: "tagFolders.list", method: "query", input: undefined },
		{
			procedure: "project.setTags",
			method: "mutation",
			input: { projectId: PROJECT_ID, tags: ["dibsteur"] },
		},
	]);
});

test("removes a project from its collection", async () => {
	const requests: Array<{ procedure: string; method: string; input: unknown }> =
		[];

	await updateProjectCollection(
		{ hostId: "host-1", id: PROJECT_ID, collection: null },
		options,
		(async (_options, procedure, method, input) => {
			requests.push({ procedure, method, input });
			return {};
		}) as ProjectCollectionCall,
	);

	expect(requests).toEqual([
		{
			procedure: "project.setTags",
			method: "mutation",
			input: { projectId: PROJECT_ID, tags: [] },
		},
	]);
});

test("explains when the host does not support project collections", async () => {
	await expect(
		updateProjectCollection(
			{ hostId: "host-1", id: PROJECT_ID, collection: "Client work" },
			options,
			(async (_options, procedure) => {
				throw new Error(`No procedure found on path ${procedure}`);
			}) as ProjectCollectionCall,
		),
	).rejects.toThrow("does not support project collections");
});
