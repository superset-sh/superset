"use client";

import { useState } from "react";
import {
	type MockModel,
	type MockRepo,
	mockModels,
	mockRepos,
} from "../../../../mock-data";

export function useAgentPrompt() {
	const [selectedModel, setSelectedModel] = useState<MockModel>(
		mockModels[0] as MockModel,
	);
	const [selectedRepo, setSelectedRepo] = useState<MockRepo>(
		mockRepos[0] as MockRepo,
	);
	const [selectedBranch, setSelectedBranch] = useState("main");

	return {
		selectedModel,
		setSelectedModel,
		selectedRepo,
		setSelectedRepo,
		selectedBranch,
		setSelectedBranch,
	};
}
