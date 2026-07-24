import { Column, Img, Row, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { lifecycle } from "../../../lib/lifecycle-theme";

interface FeatureSplitProps {
	title: string;
	children: ReactNode;
	imageSrc: string;
	imageAlt: string;
	imageSide?: "left" | "right";
}

export function FeatureSplit({
	title,
	children,
	imageSrc,
	imageAlt,
	imageSide = "left",
}: FeatureSplitProps) {
	const image = (
		<Column style={{ width: "45%", verticalAlign: "top" }}>
			<Section
				style={{
					backgroundColor: lifecycle.colors.brand,
					borderRadius: "16px",
					padding: "20px",
				}}
			>
				<Img
					src={imageSrc}
					alt={imageAlt}
					width="212"
					style={{ width: "100%", borderRadius: "8px" }}
				/>
			</Section>
		</Column>
	);
	const gap = <Column style={{ width: "24px" }} />;
	const copy = (
		<Column style={{ width: "55%", verticalAlign: "top" }}>
			<Text
				style={{
					margin: "0 0 12px 0",
					fontFamily: lifecycle.fonts.sans,
					fontWeight: 600,
					fontSize: "20px",
					lineHeight: "28px",
					color: lifecycle.colors.ink,
				}}
			>
				{title}
			</Text>
			<Text
				style={{
					margin: 0,
					fontFamily: lifecycle.fonts.sans,
					fontSize: "16px",
					lineHeight: "24px",
					color: lifecycle.colors.mutedInk,
				}}
			>
				{children}
			</Text>
		</Column>
	);

	return (
		<Section style={{ margin: "0 0 40px 0" }}>
			<Row>
				{imageSide === "left" ? (
					<>
						{image}
						{gap}
						{copy}
					</>
				) : (
					<>
						{copy}
						{gap}
						{image}
					</>
				)}
			</Row>
		</Section>
	);
}
