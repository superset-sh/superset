import type { PageManifest } from "./usercontent/manifest";

export interface PageStorageActor {
	userId: string;
	organizationIds: readonly string[];
}

export function readable(
	manifest: PageManifest,
	actor: PageStorageActor,
): boolean {
	if (!manifest.organizationId) return false;
	if (manifest.visibility === "just_me") {
		return manifest.createdByUserId === actor.userId;
	}
	return actor.organizationIds.includes(manifest.organizationId);
}

export function writableFor(
	manifest: PageManifest,
	actor: PageStorageActor,
): boolean {
	return readable(manifest, actor);
}

export function guestReadable(manifest: PageManifest): boolean {
	return manifest.visibility === "everyone" && Boolean(manifest.organizationId);
}
