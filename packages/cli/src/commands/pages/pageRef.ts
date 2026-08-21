const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pages are addressable both ways, and a single positional argument reads
 * better than making people say which one they have. A uuid is an id; anything
 * else is a slug — slugs always carry a random suffix, so the two cannot be
 * confused for one another.
 */
export function pageRefFromArg(
	value: string,
): { id: string } | { slug: string } {
	return UUID.test(value) ? { id: value } : { slug: value };
}
