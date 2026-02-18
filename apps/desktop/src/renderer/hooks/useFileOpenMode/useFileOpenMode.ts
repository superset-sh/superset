import type { FileOpenMode } from "@superset/local-db";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DEFAULT_FILE_OPEN_MODE } from "shared/constants";

let cachedFileOpenMode: FileOpenMode = DEFAULT_FILE_OPEN_MODE;

/** Non-React getter, kept in sync by useFileOpenMode(). */
export function getFileOpenMode(): FileOpenMode {
	return cachedFileOpenMode;
}

export function useFileOpenMode(): FileOpenMode {
	const { data } = electronTrpc.settings.getFileOpenMode.useQuery();
	const mode = data ?? DEFAULT_FILE_OPEN_MODE;
	cachedFileOpenMode = mode;
	return mode;
}
