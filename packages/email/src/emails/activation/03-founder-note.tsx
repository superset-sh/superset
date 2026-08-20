import { Body, Head, Html, Preview, Text } from "@react-email/components";

const paragraph = {
	margin: "0 0 16px 0",
	fontFamily: "Arial, Helvetica, sans-serif",
	fontSize: "14px",
	lineHeight: "21px",
	color: "#222222",
} as const;

interface ActivationNudge2Props {
	userName?: string;
}

export function ActivationNudge2({
	userName = "there",
}: ActivationNudge2Props = {}) {
	return (
		<Html>
			<Head />
			<Preview>quick question from a Superset founder</Preview>
			<Body style={{ margin: 0, backgroundColor: "#FFFFFF" }}>
				<Text style={paragraph}>Hi {userName},</Text>
				<Text style={paragraph}>
					I&apos;m Kiet, one of the founders of Superset. I saw you signed up
					last week but it doesn&apos;t look like you&apos;ve gotten a workspace
					running yet.
				</Text>
				<Text style={paragraph}>
					No worries at all, I&apos;m just trying to understand where people get
					stuck. Was it the download? Setup? Not wanting to point an agent at
					your repo yet? Just busy?
				</Text>
				<Text style={paragraph}>
					Even a one-word reply helps: download, setup, trust, or busy. And if
					you hit something broken, tell me and I&apos;ll get it fixed this
					week.
				</Text>
				<Text style={{ ...paragraph, margin: 0 }}>Kiet</Text>
			</Body>
		</Html>
	);
}

export default ActivationNudge2;
