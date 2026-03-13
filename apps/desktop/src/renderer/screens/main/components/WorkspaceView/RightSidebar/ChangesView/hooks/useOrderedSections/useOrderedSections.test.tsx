import { describe, expect, test } from "bun:test";
import type {
	ChangeCategory,
	ChangedFile,
	CommitInfo,
} from "shared/changes-types";
import { useOrderedSections } from "./useOrderedSections";

const emptyFile = (): ChangedFile => ({
	path: "src/example.ts",
	status: "modified",
	additions: 0,
	deletions: 0,
});

const emptyArgs = {
	sectionOrder: [
		"against-base",
		"committed",
		"staged",
		"unstaged",
	] satisfies ChangeCategory[],
	effectiveBaseBranch: "main",
	expandedSections: {
		"against-base": true,
		committed: true,
		staged: true,
		unstaged: true,
	},
	toggleSection: () => {},
	fileListViewMode: "tree" as const,
	selectedFile: null,
	selectedCommitHash: null,
	worktreePath: "/tmp/repo",
	projectId: undefined,
	isExpandedView: false,
	againstBaseFiles: [] as ChangedFile[],
	onAgainstBaseFileSelect: () => {},
	commitsWithFiles: [] as CommitInfo[],
	expandedCommits: new Set<string>(),
	onCommitToggle: () => {},
	onCommitFileSelect: () => {},
	stagedFiles: [] as ChangedFile[],
	onStagedFileSelect: () => {},
	onUnstageFile: () => {},
	onUnstageFiles: () => {},
	onShowDiscardStagedDialog: () => {},
	onUnstageAll: () => {},
	isDiscardAllStagedPending: false,
	isUnstageAllPending: false,
	isStagedActioning: false,
	unstagedFiles: [] as ChangedFile[],
	onUnstagedFileSelect: () => {},
	onStageFile: () => {},
	onStageFiles: () => {},
	onDiscardFile: () => {},
	onShowDiscardUnstagedDialog: () => {},
	onStageAll: () => {},
	isDiscardAllUnstagedPending: false,
	isStageAllPending: false,
	isUnstagedActioning: false,
};

describe("useOrderedSections", () => {
	test("keeps the commits section visible when commit files are lazy-loaded", () => {
		const sections = useOrderedSections({
			...emptyArgs,
			commitsWithFiles: [
				{
					hash: "abc123",
					shortHash: "abc123",
					message: "feat: lazy commit files",
					author: "Test User",
					date: new Date("2026-03-06T12:00:00.000Z"),
					files: [],
				},
			],
		});

		const committedSection = sections.find(
			(section) => section.id === "committed",
		);

		expect(committedSection).toBeDefined();
		expect(committedSection?.count).toBe(1);
	});

	test("does not change other section counts", () => {
		const sections = useOrderedSections({
			...emptyArgs,
			againstBaseFiles: [emptyFile()],
			stagedFiles: [emptyFile(), emptyFile()],
			unstagedFiles: [emptyFile(), emptyFile(), emptyFile()],
		});

		expect(
			sections.find((section) => section.id === "against-base")?.count,
		).toBe(1);
		expect(sections.find((section) => section.id === "staged")?.count).toBe(2);
		expect(sections.find((section) => section.id === "unstaged")?.count).toBe(
			3,
		);
	});
});
