import { seededId } from "@pixabots/core";

export function avatarId(handle: string): string {
	return seededId(handle.toLowerCase());
}

export function avatarUrl(handle: string): string {
	return `https://pixabots.com/api/pixabot/${avatarId(handle)}?size=256`;
}
