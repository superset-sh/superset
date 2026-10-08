import type { ApprovalRequest, Decision } from "@superset/chat/protocol";
import { Button } from "@superset/ui/button";
import { type ApprovalOption, optionRole } from "../../utils/optionRole";

/**
 * Every choice sits together on the right, deny first and quiet; the
 * narrowest grant is the primary, so the default-looking button is the one
 * that gives away the least. When no option grants that little, none looks
 * like the default.
 */
export function OptionButtons({
	item,
	onRespond,
}: {
	item: ApprovalRequest & { options: ApprovalOption[] };
	onRespond: (approvalId: string, decision: Decision) => void;
}) {
	const roles = item.options.map((option) => ({
		option,
		role: optionRole(option),
	}));
	const rejects = roles.filter(({ role }) => role === "reject");
	const allows = roles.filter(({ role }) => role !== "reject");
	const primaryId = allows.find(({ role }) => role === "allow_once")?.option
		.optionId;
	const respond = (option: ApprovalOption) =>
		onRespond(item.id, { type: "option", optionId: option.optionId });
	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			{rejects.map(({ option }) => (
				<Button
					key={option.optionId}
					onClick={() => respond(option)}
					size="sm"
					variant="outline"
				>
					{option.label}
				</Button>
			))}
			{allows.map(({ option }) => (
				<Button
					key={option.optionId}
					onClick={() => respond(option)}
					size="sm"
					variant={option.optionId === primaryId ? "default" : "outline"}
				>
					{option.label}
				</Button>
			))}
		</div>
	);
}
