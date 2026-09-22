import type { PageCommentUser } from "./types";

export function pageCommentUser(
	session:
		| { user: { id: string; name?: string | null; image?: string | null } }
		| null
		| undefined,
	fallbackName: string,
): PageCommentUser {
	return {
		id: session?.user.id ?? "",
		name: session?.user.name ?? fallbackName,
		image: session?.user.image ?? null,
	};
}
