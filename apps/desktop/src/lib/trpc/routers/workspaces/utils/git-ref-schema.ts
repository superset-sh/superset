import { z } from "zod";

/**
 * A branch or revision name that will reach git as a positional argument.
 * A leading "-" would make git read it as an option (`--upload-pack=...`
 * on fetch/ls-remote runs a command), so it is rejected at the boundary.
 */
export const gitRefSchema = z
	.string()
	.refine((value) => !value.startsWith("-"), {
		message: "Branch name must not start with '-'",
	});
