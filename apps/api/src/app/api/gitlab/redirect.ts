import { env } from "@/env";

export function gitlabReturnUrl(
	params: Record<string, string | undefined>,
	member?: { organizationId: string },
): string {
	const url = new URL("/integrations/gitlab", env.NEXT_PUBLIC_WEB_URL);
	for (const [key, value] of Object.entries(params))
		if (value && key !== "organizationId") url.searchParams.set(key, value);
	if (member) url.searchParams.set("organizationId", member.organizationId);
	return url.toString();
}

export function redirectGitLab(
	params: Record<string, string | undefined>,
	member?: { organizationId: string },
): Response {
	return new Response(null, {
		status: 303,
		headers: { Location: gitlabReturnUrl(params, member) },
	});
}
