"use client";

import { useEffect, useMemo, useState } from "react";
import {
	type MockModel,
	type MockRepo,
	type MockWorkspace,
	mockModels,
	mockRepos,
} from "../../../../mock-data";

export function useAgentPrompt({
	branches,
	models = mockModels,
	repos = mockRepos,
	workspace,
}: {
	branches: string[];
	models?: MockModel[];
	repos?: MockRepo[];
	workspace: MockWorkspace;
}) {
	const initialRepo = useMemo(
		() =>
			repos.find((repo) => repo.id === workspace.repoId) ??
			(repos[0] as MockRepo),
		[repos, workspace.repoId],
	);
	const initialBranch = useMemo(
		() =>
			branches.find((branch) => branch === workspace.branch) ??
			branches[0] ??
			workspace.branch,
		[branches, workspace.branch],
	);
	const [selectedModel, setSelectedModel] = useState<MockModel>(
		(models[0] as MockModel) ?? (mockModels[0] as MockModel),
	);
	const [selectedRepo, setSelectedRepo] = useState<MockRepo>(initialRepo);
	const [selectedBranch, setSelectedBranch] = useState(initialBranch);

	useEffect(() => {
		setSelectedRepo(initialRepo);
	}, [initialRepo]);

	useEffect(() => {
		setSelectedBranch(initialBranch);
	}, [initialBranch]);

	return {
		selectedModel,
		setSelectedModel,
		selectedRepo,
		setSelectedRepo,
		selectedBranch,
		setSelectedBranch,
	};
}
