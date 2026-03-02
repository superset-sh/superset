import { Heading, Link, Section, Text } from "@react-email/components";
import { differenceInDays } from "date-fns";
import { Button, StandardLayout } from "../components";

interface OrganizationInvitationEmailProps {
	organizationName: string;
	inviterName: string;
	inviteLink: string;
	role: string;
	inviteeName?: string | null;
	inviterEmail: string;
	expiresAt: Date;
}

export function OrganizationInvitationEmail({
	organizationName = "Acme Inc",
	inviterName = "John Smith",
	inviteLink = "https://app.superset.sh/accept-invitation/123?token=abc",
	role = "member",
	inviteeName = "Satya Patel",
	inviterEmail = "john@acme.com",
	expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
}: OrganizationInvitationEmailProps) {
	const roleDisplay = role === "member" ? "Member" : "Admin";

	// Calculate days until expiration
	const daysUntilExpiration = differenceInDays(expiresAt, new Date());
	const expirationText =
		daysUntilExpiration === 1 ? "1 day" : `${daysUntilExpiration} days`;

	return (
		<StandardLayout
			preview={`${inviterName} invited you to join ${organizationName}`}
		>
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				Join <strong>{organizationName}</strong> on <strong>Superset</strong>
			</Heading>

			{inviteeName && (
				<Text className="text-base leading-[26px] mb-4 text-foreground">
					Hi {inviteeName},
				</Text>
			)}

			<Text className="text-base leading-[26px] text-foreground mb-4">
				{inviterName} ({inviterEmail}) has invited you to join{" "}
				<strong>{organizationName}</strong> on Superset as a{" "}
				<strong>{roleDisplay}</strong>.
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				Superset helps teams automate workflows, manage tasks, and collaborate
				effectively. Accept this invitation to get started.
			</Text>

			<Section className="mt-6 mb-6">
				<Button href={inviteLink}>Accept Invitation</Button>
			</Section>

			<Text className="text-xs leading-5 text-muted mt-4 mb-2">
				Or copy and paste this URL into your browser:
			</Text>
			<Link
				href={inviteLink}
				className="text-sm leading-6 text-primary break-all block mb-6 no-underline"
			>
				{inviteLink}
			</Link>

			<Text className="text-xs leading-5 text-muted">
				This invitation expires in {expirationText}. If you didn't expect this
				invitation, you can safely ignore this email.
			</Text>
		</StandardLayout>
	);
}

export default OrganizationInvitationEmail;
