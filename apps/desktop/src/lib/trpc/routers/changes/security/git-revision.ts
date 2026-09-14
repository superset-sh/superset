import { z } from "zod";

// A revision handed to git as a positional argument must not look like an
// option: `--output=<path>` on `diff-tree`/`show` truncates an arbitrary file.
export const gitRevisionSchema = z
	.string()
	.refine((value) => !value.startsWith("-"), {
		message: "Revision must not start with '-'",
	});
