import { Column, Row, Text } from "@react-email/components";

interface DetailRowProps {
	label: string;
	value: string;
}

export function DetailRow({ label, value }: DetailRowProps) {
	return (
		<Row>
			<Column>
				<Text className="text-[13px] leading-7 text-muted m-0">{label}</Text>
			</Column>
			<Column align="right">
				<Text className="text-[14px] leading-7 text-foreground m-0">
					{value}
				</Text>
			</Column>
		</Row>
	);
}
