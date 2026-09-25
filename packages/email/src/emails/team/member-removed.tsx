import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "../../components";

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
		<EmailLayout preview={`You've been removed from ${organizationName}`}>
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-4">
				You've been removed from {organizationName}
			</Heading>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Hi {memberName ?? "there"},
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				{removedByName} has removed you from <strong>{organizationName}</strong>{" "}
				on Superset.
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
				You no longer have access to this organization's projects or workspaces.
			</Text>

			<Text className="text-[13px] leading-5 text-muted m-0">
				If you believe this was a mistake, please contact {removedByName} or
				your team administrator.
			</Text>
		</EmailLayout>
	);
}

export default MemberRemovedEmail;
