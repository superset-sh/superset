import { Heading, Text } from "@react-email/components";
import { StandardLayout } from "../components";

interface MemberRemovedEmailProps {
	memberName?: string | null;
	organizationName: string;
	removedByName: string;
}

export function MemberRemovedEmail({
	memberName = "there",
	organizationName = "Acme Inc",
	removedByName = "John Smith",
}: MemberRemovedEmailProps) {
	return (
		<StandardLayout preview={`You've been removed from ${organizationName}`}>
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				You've been removed from <strong>{organizationName}</strong>
			</Heading>

			<Text className="text-base leading-[26px] mb-4 text-foreground">
				Hi {memberName ?? "there"},
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				{removedByName} has removed you from <strong>{organizationName}</strong>{" "}
				on Superset.
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				You no longer have access to this organization's workspaces, tasks, or
				workflows.
			</Text>

			<Text className="text-xs leading-5 text-muted">
				If you believe this was a mistake, please contact {removedByName} or
				your team administrator.
			</Text>
		</StandardLayout>
	);
}

export default MemberRemovedEmail;
