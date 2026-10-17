import type { RepoFileReader } from "../types";

export function readerFor(files: Record<string, string>): RepoFileReader {
	return (relativePath) => files[relativePath] ?? null;
}
