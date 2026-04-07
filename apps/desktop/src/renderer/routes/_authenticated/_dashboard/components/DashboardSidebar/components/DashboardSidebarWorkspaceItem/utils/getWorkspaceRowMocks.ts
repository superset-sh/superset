export interface WorkspaceRowMockData {
	diffStats: {
		additions: number;
		deletions: number;
	};
}

function getSeed(input: string): number {
	return [...input].reduce(
		(seed, character, index) => seed + character.charCodeAt(0) * (index + 1),
		0,
	);
}

export function getWorkspaceRowMocks(
	workspaceId: string,
): WorkspaceRowMockData {
	const seed = getSeed(workspaceId);

	return {
		diffStats: {
			additions: (seed % 24) + 3,
			deletions: (seed % 9) + 1,
		},
	};
}
