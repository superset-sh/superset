"use client";

import { ChevronDown, GitFork } from "lucide-react";
import { type MockRepo, mockRepos } from "../../../../mock-data";
import { ResponsiveDropdown } from "../../../ResponsiveDropdown";

type RepoSelectorProps = {
	selectedRepo: MockRepo;
	onRepoChange: (repo: MockRepo) => void;
};

export function RepoSelector({
	selectedRepo,
	onRepoChange,
}: RepoSelectorProps) {
	return (
		<ResponsiveDropdown
			title="Select repository"
			items={mockRepos.map((repo) => ({
				label: repo.fullName,
				icon: <GitFork className="size-3" />,
				onSelect: () => onRepoChange(repo),
			}))}
			trigger={
				<button
					type="button"
					className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<GitFork className="size-3" />
					<span>{selectedRepo.fullName}</span>
					<ChevronDown className="size-3" />
				</button>
			}
		/>
	);
}
