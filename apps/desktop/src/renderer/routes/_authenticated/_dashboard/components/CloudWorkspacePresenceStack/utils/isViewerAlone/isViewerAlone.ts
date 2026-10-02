export function isViewerAlone(
	people: { userId: string }[],
	viewerId: string | undefined,
): boolean {
	return people.every((person) => person.userId === viewerId);
}
