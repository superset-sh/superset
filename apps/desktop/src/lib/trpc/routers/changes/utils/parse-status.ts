import type {
	ChangedFile,
	CommitInfo,
	FileStatus,
	GitChangesStatus,
} from "shared/changes-types";
import type { StatusResult } from "simple-git";

function mapGitStatus(gitIndex: string, gitWorking: string): FileStatus {
	if (gitIndex === "A" || gitWorking === "A") return "added";
	if (gitIndex === "D" || gitWorking === "D") return "deleted";
	if (gitIndex === "R") return "renamed";
	if (gitIndex === "C") return "copied";
	if (gitIndex === "?" || gitWorking === "?") return "untracked";
	return "modified";
}

function toChangedFile(
	path: string,
	gitIndex: string,
	gitWorking: string,
): ChangedFile {
	return {
		path,
		status: mapGitStatus(gitIndex, gitWorking),
		additions: 0,
		deletions: 0,
	};
}

export function parseGitStatus(
	status: StatusResult,
): Pick<GitChangesStatus, "branch" | "staged" | "unstaged" | "untracked"> {
	const staged: ChangedFile[] = [];
	const unstaged: ChangedFile[] = [];
	const untracked: ChangedFile[] = [];

	for (const file of status.files) {
		const path = file.path;
		const index = file.index;
		const working = file.working_dir;

		if (index === "?" && working === "?") {
			untracked.push(toChangedFile(path, index, working));
			continue;
		}

		if (index && index !== " " && index !== "?") {
			staged.push({
				path,
				oldPath: file.path !== file.from ? file.from : undefined,
				status: mapGitStatus(index, " "),
				additions: 0,
				deletions: 0,
			});
		}

		if (working && working !== " " && working !== "?") {
			unstaged.push({
				path,
				status: mapGitStatus(" ", working),
				additions: 0,
				deletions: 0,
			});
		}
	}

	return {
		branch: status.current || "HEAD",
		staged,
		unstaged,
		untracked,
	};
}

export function parseGitLog(logOutput: string): CommitInfo[] {
	if (!logOutput.trim()) return [];

	const commits: CommitInfo[] = [];
	const lines = logOutput.trim().split("\n");

	for (const line of lines) {
		if (!line.trim()) continue;

		// Format: hash|shortHash|message|author|date
		// Use slice(2, -2) to preserve '|' characters in commit messages
		const parts = line.split("|");
		if (parts.length < 5) continue;

		const hash = parts[0]?.trim();
		const shortHash = parts[1]?.trim();
		const message = parts.slice(2, -2).join("|").trim();
		const author = parts[parts.length - 2]?.trim();
		const dateStr = parts[parts.length - 1]?.trim();

		if (!hash || !shortHash) continue;

		let date: Date;
		if (dateStr) {
			const parsed = new Date(dateStr);
			date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
		} else {
			date = new Date();
		}

		commits.push({
			hash,
			shortHash,
			message: message || "",
			author: author || "",
			date,
			files: [],
		});
	}

	return commits;
}

export function parseDiffNumstat(
	numstatOutput: string,
): Map<string, { additions: number; deletions: number }> {
	const stats = new Map<string, { additions: number; deletions: number }>();

	for (const line of numstatOutput.trim().split("\n")) {
		if (!line.trim()) continue;

		// Format: additions\tdeletions\tfilepath
		// For renames: additions\tdeletions\toldpath => newpath
		const [addStr, delStr, ...pathParts] = line.split("\t");
		const rawPath = pathParts.join("\t");
		if (!rawPath) continue;

		const additions = addStr === "-" ? 0 : Number.parseInt(addStr, 10) || 0;
		const deletions = delStr === "-" ? 0 : Number.parseInt(delStr, 10) || 0;
		const statEntry = { additions, deletions };

		const renameMatch = rawPath.match(/^(.+) => (.+)$/);
		if (renameMatch) {
			const oldPath = renameMatch[1];
			const newPath = renameMatch[2];
			stats.set(newPath, statEntry);
			stats.set(oldPath, statEntry);
		} else {
			stats.set(rawPath, statEntry);
		}
	}

	return stats;
}

export function parseNameStatus(nameStatusOutput: string): ChangedFile[] {
	const files: ChangedFile[] = [];

	for (const line of nameStatusOutput.trim().split("\n")) {
		if (!line.trim()) continue;

		// Format: status\tfilepath (or status\toldpath\tnewpath for renames)
		const parts = line.split("\t");
		const statusCode = parts[0];
		if (!statusCode) continue;

		const isRenameOrCopy =
			statusCode.startsWith("R") || statusCode.startsWith("C");
		const path = isRenameOrCopy ? parts[2] : parts[1];
		const oldPath = isRenameOrCopy ? parts[1] : undefined;

		if (!path) continue;

		let status: FileStatus;
		switch (statusCode[0]) {
			case "A":
				status = "added";
				break;
			case "D":
				status = "deleted";
				break;
			case "R":
				status = "renamed";
				break;
			case "C":
				status = "copied";
				break;
			default:
				status = "modified";
		}

		files.push({
			path,
			oldPath,
			status,
			additions: 0,
			deletions: 0,
		});
	}

	return files;
}
