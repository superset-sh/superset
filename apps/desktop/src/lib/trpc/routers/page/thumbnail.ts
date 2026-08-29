import { ensureThumbnail, peekThumbnail } from "main/lib/pageThumbnails";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const thumbnailKey = z.object({
	accountId: z.string(),
	pageId: z.string(),
	version: z.string(),
});

export const createPageThumbnailRouter = () => {
	return router({
		peek: publicProcedure
			.input(thumbnailKey)
			.query(({ input }) => peekThumbnail(input)),

		ensure: publicProcedure
			.input(thumbnailKey.extend({ html: z.string() }))
			.mutation(({ input }) => ensureThumbnail(input)),
	});
};
