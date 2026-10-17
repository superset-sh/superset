import { hashString } from "renderer/routes/_authenticated/_dashboard/utils/hashString";

const SECOND_SEED = 0x9e3779b9;
const SECOND_PRIME = 0x85ebca6b;

/** Scoped: the same content under two scopes must not share a key. */
export function buildContentKey(scope: string, content: string): string {
	return [
		scope,
		content.length,
		hashString(content).toString(36),
		hashString(content, SECOND_SEED, SECOND_PRIME).toString(36),
	].join(":");
}
