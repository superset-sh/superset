export function getTaskDisplayId(task: {
	slug: string;
	externalKey?: string | null;
}): string {
	return task.externalKey || task.slug;
}
