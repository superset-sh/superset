import type { ChangedFile } from "shared/changes-types";
import {
	FILE_DIFF_SECTION_COLLAPSED_HEIGHT,
	FILE_DIFF_SECTION_PLACEHOLDER_HEIGHT,
} from "../../FileDiffSection/constants";

const SMALL_DIFF_MAX_LINES = 40;
const MEDIUM_DIFF_MAX_LINES = 200;
const LARGE_DIFF_MAX_LINES = 600;

const SMALL_PLACEHOLDER_HEIGHT = 140;
const MEDIUM_PLACEHOLDER_HEIGHT = 220;
const LARGE_PLACEHOLDER_HEIGHT = FILE_DIFF_SECTION_PLACEHOLDER_HEIGHT;
const XL_PLACEHOLDER_HEIGHT = 360;

const GENERATED_FILE_PATTERNS = [
	/^bun\.lock(b)?$/,
	/^package-lock\.json$/,
	/^yarn\.lock$/,
	/^pnpm-lock\.yaml$/,
	/^composer\.lock$/,
	/^Gemfile\.lock$/,
	/^Cargo\.lock$/,
	/^poetry\.lock$/,
	/^Pipfile\.lock$/,
	/^go\.sum$/,
	/\.min\.(js|css)$/,
	/\.bundle\.(js|css)$/,
	/[\\/]vendor[\\/]/,
	/[\\/]node_modules[\\/]/,
	/[\\/]dist[\\/]/,
	/[\\/]build[\\/]/,
];

function isGeneratedFile(filePath: string): boolean {
	const fileName = filePath.split("/").pop() || filePath;
	return GENERATED_FILE_PATTERNS.some(
		(pattern) => pattern.test(fileName) || pattern.test(filePath),
	);
}

function getPlaceholderHeight(file: ChangedFile): number {
	const changedLineCount = file.additions + file.deletions;

	if (isGeneratedFile(file.path)) {
		return XL_PLACEHOLDER_HEIGHT;
	}

	if (changedLineCount <= SMALL_DIFF_MAX_LINES) {
		return SMALL_PLACEHOLDER_HEIGHT;
	}

	if (changedLineCount <= MEDIUM_DIFF_MAX_LINES) {
		return MEDIUM_PLACEHOLDER_HEIGHT;
	}

	if (changedLineCount <= LARGE_DIFF_MAX_LINES) {
		return LARGE_PLACEHOLDER_HEIGHT;
	}

	return XL_PLACEHOLDER_HEIGHT;
}

export function getEstimatedFileDiffSectionHeight(params: {
	file: ChangedFile;
	isCollapsed: boolean;
}): number {
	if (params.isCollapsed) {
		return FILE_DIFF_SECTION_COLLAPSED_HEIGHT;
	}

	return FILE_DIFF_SECTION_COLLAPSED_HEIGHT + getPlaceholderHeight(params.file);
}
