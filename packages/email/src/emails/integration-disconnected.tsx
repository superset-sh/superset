import { Heading, Section, Text } from "@react-email/components";
import { Button, StandardLayout } from "../components";

export interface DisconnectedConnection {
	orgName: string;
	workspaceName: string;
	provider: "Linear" | "Slack";
	winnerEmail: string;
}

interface IntegrationDisconnectedEmailProps {
	recipientName?: string | null;
	connections?: DisconnectedConnection[];
}

const PLACEHOLDER_CONNECTIONS: DisconnectedConnection[] = [
	{
		orgName: "Acme Inc",
		workspaceName: "Acme",
		provider: "Linear",
		winnerEmail: "owner@acme.com",
	},
];

export function IntegrationDisconnectedEmail({
	recipientName,
	connections = PLACEHOLDER_CONNECTIONS,
}: IntegrationDisconnectedEmailProps) {
	const isSingle = connections.length === 1;
	const first = connections[0];

	return (
		<StandardLayout preview="A Superset integration was disconnected">
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				A Superset integration was disconnected
			</Heading>

			<Text className="text-base leading-[26px] mb-4 text-foreground">
				Hi {recipientName ?? "there"},
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				We found that multiple Superset organizations were connected to the same{" "}
				{isSingle ? first?.provider : "external"} workspace, which caused
				webhook syncs to route non-deterministically between them. To fix it, we
				kept the most recently active org's connection and disconnected the
				rest.
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				{connections.length > 1
					? "Your following connections were disconnected:"
					: "Your following connection was disconnected:"}
			</Text>

			<Section className="mb-6">
				{connections.map((c) => (
					<Text
						key={`${c.orgName}-${c.provider}-${c.workspaceName}`}
						className="text-base leading-[26px] text-foreground mb-2"
					>
						• <strong>{c.orgName}</strong> → {c.provider} workspace{" "}
						<strong>{c.workspaceName}</strong> — now owned by{" "}
						<a href={`mailto:${c.winnerEmail}`}>{c.winnerEmail}</a>
					</Text>
				))}
			</Section>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				If your org should be the one connected, ask the listed owner to
				disconnect from their Superset Integrations page first, then reconnect
				from yours.
			</Text>

			<Section className="mt-6 mb-6">
				<Button href="https://app.superset.sh/integrations">
					Open Integrations
				</Button>
			</Section>

			<Text className="text-xs leading-5 text-muted">
				Reply to this email if you have questions.
			</Text>
		</StandardLayout>
	);
}

export default IntegrationDisconnectedEmail;
