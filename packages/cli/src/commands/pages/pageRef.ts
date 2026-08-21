const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A uuid is an id, anything else a slug.
export function pageRefFromArg(
	value: string,
): { id: string } | { slug: string } {
	return UUID.test(value) ? { id: value } : { slug: value };
}
