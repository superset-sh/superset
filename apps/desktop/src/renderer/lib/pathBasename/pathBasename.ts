export function getBaseName(absolutePath: string): string {
	return absolutePath.split(/[/\\]/).filter(Boolean).pop() ?? absolutePath;
}
