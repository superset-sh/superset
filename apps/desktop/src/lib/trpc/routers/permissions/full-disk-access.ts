import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const FULL_DISK_ACCESS_PROBE_PATHS = [
	["Library", "Application Support", "com.apple.TCC", "TCC.db"],
	["Library", "Safari", "History.db"],
	["Library", "Safari", "Bookmarks.plist"],
	["Library", "Messages", "chat.db"],
] as const;

type ReadProbe = (filePath: string) => void;

function openForRead(filePath: string): void {
	const fileDescriptor = fs.openSync(filePath, "r");
	fs.closeSync(fileDescriptor);
}

function isSkippableProbeError(error: unknown): boolean {
	if (!(error instanceof Error) || !("code" in error)) {
		return false;
	}

	const code = (error as NodeJS.ErrnoException).code;
	return code === "ENOENT" || code === "ENOTDIR";
}

function getFullDiskAccessProbePaths(homeDirectory: string): string[] {
	return FULL_DISK_ACCESS_PROBE_PATHS.map((segments) =>
		path.join(homeDirectory, ...segments),
	);
}

export function checkFullDiskAccess({
	homeDirectory = homedir(),
	readProbe = openForRead,
}: {
	homeDirectory?: string;
	readProbe?: ReadProbe;
} = {}): boolean {
	for (const probePath of getFullDiskAccessProbePaths(homeDirectory)) {
		try {
			readProbe(probePath);
			return true;
		} catch (error) {
			// Some protected app data files are optional. Missing path probes fall
			// through; permission errors mean macOS denied access to protected data.
			if (isSkippableProbeError(error)) {
				continue;
			}

			return false;
		}
	}

	return false;
}
