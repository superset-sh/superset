import { Heading, Section, Text } from "@react-email/components";
import { Button, StandardLayout } from "../components";

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
		<StandardLayout preview={`You've been added to ${organizationName}`}>
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				You're now part of <strong>{organizationName}</strong>
			</Heading>

			<Text className="text-base leading-[26px] mb-4 text-foreground">
				Hi {memberName ?? "there"},
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				{addedByName} has added you to <strong>{organizationName}</strong> on
				Superset as a <strong>{roleDisplay}</strong>.
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				You now have access to the team's workspaces, tasks, and workflows. Head
				over to your dashboard to get started.
			</Text>

			<Section className="mt-6 mb-6">
				<Button href={dashboardLink}>Go to Dashboard</Button>
			</Section>

			<Text className="text-xs leading-5 text-muted">
				If you have any questions, reach out to {addedByName} or your team
				administrator.
			</Text>
		</StandardLayout>
	);
}

export default MemberAddedEmail;
