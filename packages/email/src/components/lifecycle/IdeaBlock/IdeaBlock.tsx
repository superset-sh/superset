import { Img, Link, Section, Text } from "@react-email/components";
import { lifecycle } from "../../../lib/lifecycle-theme";
import { DisplayHeading } from "../DisplayHeading";

interface IdeaBlockProps {
	title: string;
	quote: string;
	linkLabel: string;
	href: string;
	doodleSrc?: string;
}

export function IdeaBlock({
	title,
	quote,
	linkLabel,
	href,
	doodleSrc,
}: IdeaBlockProps) {
	return (
		<Section style={{ textAlign: "center", padding: "0 0 36px 0" }}>
			{doodleSrc && (
				<Img
					src={doodleSrc}
					alt=""
					width="85"
					style={{ margin: "0 auto 20px auto" }}
				/>
			)}
			<DisplayHeading size="sm">{title}</DisplayHeading>
			<Text
				style={{
					margin: "-8px 0 12px 0",
					fontFamily: lifecycle.fonts.sans,
					fontSize: "16px",
					lineHeight: "24px",
					color: lifecycle.colors.mutedInk,
					textAlign: "center",
				}}
			>
				&ldquo;{quote}&rdquo;
			</Text>
			<Link
				href={href}
				style={{
					fontFamily: lifecycle.fonts.sans,
					fontWeight: 600,
					fontSize: "15px",
					color: lifecycle.colors.brand,
					textDecoration: "underline",
				}}
			>
				{linkLabel}
			</Link>
		</Section>
	);
}
