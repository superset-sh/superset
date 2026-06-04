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

interface EnterpriseInquiryEmailProps {
	name: string;
	role: string;
	company: string;
	email: string;
	phone?: string;
	message?: string;
}

export function EnterpriseInquiryEmail({
	name = "Jane Doe",
	role = "Engineering Lead",
	company = "Acme Inc.",
	email = "jane@example.com",
	phone = "",
	message = "",
}: EnterpriseInquiryEmailProps) {
	return (
		<Html>
			<Head />
			<Preview>
				Enterprise inquiry from {name} ({email})
			</Preview>
			<Body style={body}>
				<Container style={container}>
					<Heading style={heading}>New Enterprise Inquiry</Heading>

					<Text style={paragraph}>
						A new enterprise inquiry was submitted from the marketing site.
					</Text>

					<Hr style={hr} />

					<Text style={label}>Name</Text>
					<Text style={value}>{name}</Text>

					<Text style={label}>Role</Text>
					<Text style={value}>{role}</Text>

					<Text style={label}>Company</Text>
					<Text style={value}>{company}</Text>

					<Text style={label}>Email</Text>
					<Text style={value}>{email}</Text>

					{phone && (
						<>
							<Text style={label}>Phone</Text>
							<Text style={value}>{phone}</Text>
						</>
					)}

					{message && (
						<>
							<Text style={label}>What problem are they trying to solve?</Text>
							<Text style={value}>{message}</Text>
						</>
					)}
				</Container>
			</Body>
		</Html>
	);
}

// Default export for React Email preview
export default EnterpriseInquiryEmail;

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
