import { Heading, Section, Text } from "@react-email/components";
import { Button, EmailLayout } from "../../components";

interface MemberAddedEmailProps {
	memberName?: string | null;
	organizationName: string;
	role: string;
	addedByName: string;
	dashboardLink?: string;
}

export function MemberAddedEmail({
	memberName = "there",
	organizationName = "Acme Inc",
	role = "member",
	addedByName = "John Smith",
	dashboardLink = "https://app.superset.sh",
}: MemberAddedEmailProps) {
	const roleDisplay =
		role === "member" ? "Member" : role === "admin" ? "Admin" : "Owner";

	return (
		<EmailLayout preview={`You've been added to ${organizationName}`}>
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-4">
				You're now part of {organizationName}
			</Heading>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Hi {memberName ?? "there"},
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				{addedByName} has added you to <strong>{organizationName}</strong> on
				Superset as a <strong>{roleDisplay}</strong>.
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
				You now have access to the team's projects and workspaces. Open Superset
				to get started.
			</Text>

			<Section className="mb-6">
				<Button href={dashboardLink}>Open Superset</Button>
			</Section>

			<Text className="text-[13px] leading-5 text-muted m-0">
				If you have any questions, reach out to {addedByName} or your team
				administrator.
			</Text>
		</EmailLayout>
	);
}

export default MemberAddedEmail;
