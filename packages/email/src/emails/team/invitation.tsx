import { Heading, Link, Section, Text } from "@react-email/components";
import { differenceInDays } from "date-fns";
import { Button, EmailLayout } from "../../components";

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

	const daysUntilExpiration = differenceInDays(expiresAt, new Date());
	const expirationText =
		daysUntilExpiration === 1 ? "1 day" : `${daysUntilExpiration} days`;

	return (
		<EmailLayout
			preview={`${inviterName} invited you to join ${organizationName}`}
		>
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-4">
				Join {organizationName} on Superset
			</Heading>

			{inviteeName && (
				<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
					Hi {inviteeName},
				</Text>
			)}

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				{inviterName} ({inviterEmail}) has invited you to join{" "}
				<strong>{organizationName}</strong> on Superset as a{" "}
				<strong>{roleDisplay}</strong>.
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
				Superset runs coding agents in parallel, each in an isolated copy of
				your repo. Accept the invite to work alongside your team.
			</Text>

			<Section className="mb-6">
				<Button href={inviteLink}>Accept Invitation</Button>
			</Section>

			<Text className="text-[13px] leading-5 text-muted m-0 mb-1">
				Or copy and paste this URL into your browser:
			</Text>
			<Link
				href={inviteLink}
				className="text-[13px] leading-5 text-muted underline break-all block mb-6"
			>
				{inviteLink}
			</Link>

			<Text className="text-[13px] leading-5 text-muted m-0">
				This invitation expires in {expirationText}. If you didn't expect this
				invitation, you can safely ignore this email.
			</Text>
		</EmailLayout>
	);
}

export default OrganizationInvitationEmail;
