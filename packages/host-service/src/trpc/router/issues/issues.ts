import { router } from "../../index";
import { getContent } from "./procedures/get-content";

export const issuesRouter = router({
	getContent,
});
