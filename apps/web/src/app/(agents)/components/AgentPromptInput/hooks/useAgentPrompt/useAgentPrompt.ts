"use client";

import type { PromptInputMessage } from "@superset/ui/ai-elements/prompt-input";
import { useCallback, useState } from "react";
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

	const handleSubmit = useCallback((_message: PromptInputMessage) => {
		// TODO: Wire to v2Workspace.create
	}, []);

	return {
		selectedModel,
		setSelectedModel,
		selectedRepo,
		setSelectedRepo,
		selectedBranch,
		setSelectedBranch,
		handleSubmit,
	};
}
