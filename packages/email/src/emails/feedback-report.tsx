import {
	Body,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Preview,
	Text,
} from "@react-email/components";

interface FeedbackReportEmailProps {
	type: "bug" | "feature" | "general";
	title: string;
	body: string;
	userName?: string;
	userEmail: string;
	userId: string;
	accountCreated?: string;
	organizationName?: string;
	organizationId?: string;
	plan: string;
	appVersion?: string;
	os?: string;
}

const TYPE_LABELS: Record<FeedbackReportEmailProps["type"], string> = {
	bug: "Bug report",
	feature: "Feature request",
	general: "Feedback",
};

export function FeedbackReportEmail({
	type = "bug",
	title = "Terminal detaches on sleep",
	body = "Steps to reproduce...",
	userName = "Jane Doe",
	userEmail = "jane@example.com",
	userId = "00000000-0000-0000-0000-000000000000",
	accountCreated = "2025-12-23T18:58:32.105Z",
	organizationName = "Acme",
	organizationId = "00000000-0000-0000-0000-000000000000",
	plan = "pro (active)",
	appVersion = "1.20.0",
	os = "darwin 25.6.0 arm64",
}: FeedbackReportEmailProps) {
	const reporter = userName ? `${userName} <${userEmail}>` : userEmail;
	const accountSince = accountCreated
		? new Date(accountCreated).toLocaleDateString("en-US", {
				year: "numeric",
				month: "short",
				day: "numeric",
			})
		: undefined;

	return (
		<Html>
			<Head />
			<Preview>
				{TYPE_LABELS[type]} from {userName || userEmail} ({plan})
			</Preview>
			<Body style={bodyStyle}>
				<Container style={container}>
					<Text style={kicker}>
						{TYPE_LABELS[type]} · {plan}
					</Text>
					<Heading style={heading}>{title}</Heading>

					<Text style={reportBody}>{body}</Text>

					<Hr style={hr} />

					<Text style={replyNote}>
						Reply to this email to respond to {userName || "the reporter"}{" "}
						directly ({userEmail}).
					</Text>

					<Text style={label}>Reporter</Text>
					<Text style={value}>{reporter}</Text>

					{organizationName ? (
						<>
							<Text style={label}>Organization</Text>
							<Text style={value}>{organizationName}</Text>
						</>
					) : null}

					{accountSince ? (
						<>
							<Text style={label}>Customer since</Text>
							<Text style={value}>{accountSince}</Text>
						</>
					) : null}

					<Text style={label}>Environment</Text>
					<Text style={value}>
						{appVersion ?? "unknown version"} · {os ?? "unknown OS"}
					</Text>

					<Hr style={hr} />

					<Text style={meta}>
						User ID {userId}
						{organizationId ? ` · Org ID ${organizationId}` : ""}
					</Text>
				</Container>
			</Body>
		</Html>
	);
}

export default FeedbackReportEmail;

const bodyStyle = {
	backgroundColor: "#ffffff",
	fontFamily:
		'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const container = {
	margin: "0 auto",
	padding: "40px 24px",
	maxWidth: "560px",
};

const kicker = {
	color: "#77767e",
	fontSize: "12px",
	fontWeight: "600" as const,
	textTransform: "uppercase" as const,
	letterSpacing: "0.05em",
	lineHeight: "16px",
	margin: "0 0 8px 0",
};

const heading = {
	color: "#000000",
	fontSize: "24px",
	fontWeight: "600" as const,
	lineHeight: "1.3",
	margin: "0 0 20px 0",
};

const reportBody = {
	color: "#242424",
	fontSize: "16px",
	lineHeight: "24px",
	margin: "0",
	whiteSpace: "pre-wrap" as const,
};

const hr = {
	borderColor: "#EBEBEB",
	margin: "24px 0",
};

const replyNote = {
	color: "#515759",
	fontSize: "14px",
	lineHeight: "20px",
	margin: "0 0 8px 0",
};

const label = {
	color: "#77767e",
	fontSize: "12px",
	fontWeight: "600" as const,
	textTransform: "uppercase" as const,
	letterSpacing: "0.05em",
	lineHeight: "16px",
	margin: "16px 0 4px 0",
};

const value = {
	color: "#242424",
	fontSize: "16px",
	lineHeight: "22px",
	margin: "0",
};

const meta = {
	color: "#a3a1aa",
	fontSize: "12px",
	lineHeight: "16px",
	margin: "0",
};
