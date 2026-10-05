import type { RouterOutputs } from "@superset/trpc";
import type { StatusType } from "../../components/TasksView/components/shared/StatusIcon";

export type LinearIssue =
	RouterOutputs["integration"]["linear"]["issues"]["issues"][number];
export type LinearIssueDetail = RouterOutputs["integration"]["linear"]["issue"];
export type LinearWorkspace =
	RouterOutputs["integration"]["linear"]["workspace"];
export type LinearState = LinearIssue["state"];
export type LinearUser = LinearWorkspace["users"][number];

export function statusIconType(stateType: LinearState["type"]): StatusType {
	return stateType === "triage" ? "backlog" : stateType;
}
