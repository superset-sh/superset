import { z } from "zod";
export const gitlabWebhookOriginSchema = z.preprocess(
	(value) => (value === "" ? undefined : value),
	z
		.string()
		.refine((value) => {
			try {
				if (/[\s\\]/.test(value) || !/^https:\/\/[^/?#]+\/?$/i.test(value))
					return false;
				const url = new URL(value);
				return (
					url.protocol === "https:" &&
					!url.username &&
					!url.password &&
					url.pathname === "/" &&
					!url.search &&
					!url.hash
				);
			} catch {
				return false;
			}
		}, "GitLab webhook URL must be an HTTPS root origin")
		.transform((value) => new URL(value).origin)
		.optional(),
);
export function resolveGitlabWebhookOrigin(
	origin: string | undefined,
	apiOrigin: string,
): string {
	return gitlabWebhookOriginSchema.parse(origin) ?? apiOrigin;
}
