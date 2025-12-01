import { quote } from "shell-quote";

/**
 * Shell-escape file paths for safe insertion into terminal.
 */
export function shellEscapePaths(paths: string[]): string {
	return quote(paths);
}
