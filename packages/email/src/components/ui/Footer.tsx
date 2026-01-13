import { Hr, Link, Section, Text } from "@react-email/components";
import { Logo } from "./Logo";

export function Footer() {
	return (
		<Section style={footer}>
			{/* Divider */}
			<Hr style={divider} />

			{/* Logo */}
			<Section style={logoSection}>
				<Logo />
			</Section>

			{/* Tagline */}
			<Text style={tagline}>
				Automate your workflows with AI-powered task management.
			</Text>

			{/* Legal Links */}
			<Text style={legalLinks}>
				<Link href="https://superset.sh/privacy" style={link}>
					Privacy Policy
				</Link>
				{" • "}
				<Link href="https://superset.sh/terms" style={link}>
					Terms of Service
				</Link>
				{" • "}
				<Link href="https://superset.sh/contact" style={link}>
					Contact
				</Link>
			</Text>

			{/* Company Info */}
			<Text style={companyInfo}>
				© 2026 Superset. All rights reserved.
				<br />
				123 Main Street, San Francisco, CA 94105
			</Text>
		</Section>
	);
}

const footer = {
	backgroundColor: "#ffffff",
	padding: "0 36px 28px 36px",
};

const divider = {
	border: "none",
	borderTop: "1px solid #e8e8ea",
	margin: "28px 0",
};

const logoSection = {
	paddingBottom: "16px",
};

const tagline = {
	color: "#77767e",
	fontSize: "14px",
	lineHeight: "22px",
	margin: "0 0 24px 0",
};

const legalLinks = {
	color: "#77767e",
	fontSize: "12px",
	lineHeight: "16px",
	margin: "0 0 16px 0",
};

const link = {
	color: "#77767e",
	textDecoration: "none",
};

const companyInfo = {
	color: "#77767e",
	fontSize: "12px",
	lineHeight: "16px",
	margin: "0",
};
