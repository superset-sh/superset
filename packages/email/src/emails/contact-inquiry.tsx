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

interface ContactInquiryEmailProps {
	name: string;
	email: string;
	topic?: string;
	message: string;
}

export function ContactInquiryEmail({
	name = "Jane Doe",
	email = "jane@example.com",
	topic = "General question",
	message = "Hello from the marketing site.",
}: ContactInquiryEmailProps) {
	return (
		<Html>
			<Head />
			<Preview>
				Contact message from {name} ({email})
			</Preview>
			<Body style={body}>
				<Container style={container}>
					<Heading style={heading}>New Contact Message</Heading>

					<Text style={paragraph}>
						A new contact message was submitted from the marketing site.
					</Text>

					<Hr style={hr} />

					<Text style={label}>Name</Text>
					<Text style={value}>{name}</Text>

					<Text style={label}>Email</Text>
					<Text style={value}>{email}</Text>

					<Text style={label}>Topic</Text>
					<Text style={value}>{topic}</Text>

					<Text style={label}>Message</Text>
					<Text style={messageValue}>{message}</Text>
				</Container>
			</Body>
		</Html>
	);
}

export default ContactInquiryEmail;

const body = {
	backgroundColor: "#ffffff",
	fontFamily:
		'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const container = {
	margin: "0 auto",
	padding: "40px 24px",
	maxWidth: "560px",
};

const heading = {
	color: "#000000",
	fontSize: "28px",
	fontWeight: "600" as const,
	lineHeight: "1.3",
	margin: "0 0 24px 0",
};

const paragraph = {
	color: "#515759",
	fontSize: "16px",
	lineHeight: "22px",
	margin: "0 0 16px 0",
};

const hr = {
	borderColor: "#EBEBEB",
	margin: "24px 0",
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
	margin: "0 0 0 0",
};

const messageValue = {
	...value,
	whiteSpace: "pre-wrap" as const,
};
