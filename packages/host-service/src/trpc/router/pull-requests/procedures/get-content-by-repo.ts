import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { fetchPullRequestContent } from "../shared/fetch-pull-request-content";

export const getContentByRepo = protectedProcedure
	.input(
		z.object({
			repoFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
			prNumber: z.number().int().positive(),
		}),
	)
	.query(({ input }) => {
		const [owner, name] = input.repoFullName.split("/");
		return fetchPullRequestContent(
			{ owner: owner ?? "", name: name ?? "" },
			input.prNumber,
		);
	});
