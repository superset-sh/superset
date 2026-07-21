import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { setGroupCollapsed } from "../set-collapsed";

export default command({
	description: "Expand a sidebar group",
	args: [positional("group").required().desc("Group name or ID")],
	run: ({ ctx, args }) => setGroupCollapsed(ctx, args.group as string, false),
});
