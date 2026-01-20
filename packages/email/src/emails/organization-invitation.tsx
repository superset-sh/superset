import { Heading, Text } from "@react-email/components";
import { Button, StandardLayout } from "../components";

interface OrganizationInvitationEmailProps {
	organizationName: string;
	inviterName: string;
	inviteLink: string;
	role: string;
}

export function OrganizationInvitationEmail({
	organizationName = "Acme Inc",
	inviterName = "John Doe",
	inviteLink = "https://app.superset.sh/accept-invitation/123",
	role = "member",
}: OrganizationInvitationEmailProps) {
	const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);

	return (
		<StandardLayout
			preview={`${inviterName} invited you to join ${organizationName}`}
		>
			<Heading>You've been invited to join {organizationName}</Heading>

			<Text>
				{inviterName} has invited you to join{" "}
				<strong>{organizationName}</strong> on Superset as a{" "}
				<strong>{roleDisplay}</strong>.
			</Text>

			<Text>
				Superset helps teams automate workflows and boost productivity with
				AI-powered task management.
			</Text>

			<Button href={inviteLink}>Accept Invitation</Button>

			<Text>
				This invitation will expire in 1 week. If you weren't expecting this
				invitation, you can safely ignore this email.
			</Text>
		</StandardLayout>
	);
}

export default OrganizationInvitationEmail;
