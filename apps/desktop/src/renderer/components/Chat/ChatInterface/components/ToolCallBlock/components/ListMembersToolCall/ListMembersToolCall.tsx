import { UsersIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import {
	getToolResultData,
	getToolResultObjectArray,
} from "../../utils/getToolResultData";
import { SupersetToolCall } from "../SupersetToolCall";

interface ListMembersToolCallProps {
	part: ToolPart;
}

export function ListMembersToolCall({ part }: ListMembersToolCallProps) {
	const resultData = getToolResultData(part);
	const members = getToolResultObjectArray(resultData, "members");

	return (
		<SupersetToolCall
			part={part}
			toolName="List members"
			icon={UsersIcon}
			details={
				<div className="space-y-2">
					<div className="text-muted-foreground">Members: {members.length}</div>
					{members.length > 0 ? (
						<div className="space-y-1">
							{members.map((member, index) => {
								const memberId =
									typeof member.id === "string" ? member.id : null;
								const name =
									typeof member.name === "string"
										? member.name
										: typeof member.email === "string"
											? member.email
											: `Member ${index + 1}`;
								const email =
									typeof member.email === "string" ? member.email : null;
								const role =
									typeof member.role === "string" ? member.role : null;
								return (
									<div
										key={memberId ?? `${name}-${email ?? "unknown"}`}
										className="rounded border bg-background/70 px-2 py-1"
									>
										<div className="font-medium text-foreground">{name}</div>
										<div className="text-muted-foreground">
											{email ?? "No email"}
											{role ? ` • ${role}` : ""}
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="text-muted-foreground">No members in result.</div>
					)}
				</div>
			}
		/>
	);
}
