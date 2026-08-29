import { router } from "../..";
import { createPageContentRouter } from "./content";
import { createPageThumbnailRouter } from "./thumbnail";

export const createPageRouter = () => {
	return router({
		content: createPageContentRouter(),
		thumbnail: createPageThumbnailRouter(),
	});
};
