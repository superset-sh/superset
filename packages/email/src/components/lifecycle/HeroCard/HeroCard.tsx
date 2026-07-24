import { Img, Section } from "@react-email/components";
import { lifecycle } from "../../../lib/lifecycle-theme";

interface HeroCardProps {
	src: string;
	alt: string;
	href?: string;
}

export function HeroCard({ src, alt, href }: HeroCardProps) {
	const img = (
		<Img
			src={src}
			alt={alt}
			width="496"
			style={{ width: "100%", borderRadius: "16px" }}
		/>
	);
	return (
		<Section
			style={{
				backgroundColor: lifecycle.colors.card,
				borderRadius: "24px",
				padding: "36px",
				margin: "0 0 32px 0",
			}}
		>
			{href ? <a href={href}>{img}</a> : img}
		</Section>
	);
}
