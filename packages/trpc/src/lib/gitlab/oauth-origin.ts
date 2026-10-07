import { SsrfError, trustedGitLabOrigin } from "./ssrf";

export function assertGitLabOAuthOrigin(
	origin: string,
	issuer: string | undefined = process.env.GITLAB_ISSUER,
): string {
	const configured = issuer
		? trustedGitLabOrigin(issuer)
		: "https://gitlab.com";
	if (!configured || trustedGitLabOrigin(origin) !== configured)
		throw new SsrfError(
			"GitLab OAuth host does not match its client registration",
		);
	return configured;
}
