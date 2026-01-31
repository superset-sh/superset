import { Box, Text } from "ink";

interface TableProps {
	data: Record<string, unknown>[];
}

export default function Table({ data }: TableProps) {
	if (!data || data.length === 0) {
		return null;
	}

	const firstRow = data[0];
	if (!firstRow) {
		return null;
	}
	const keys = Object.keys(firstRow);

	return (
		<Box flexDirection="column">
			{data.map((row) => {
				// Create a stable key from the row data
				const rowKey =
					"id" in row ? String(row.id) : JSON.stringify(row).slice(0, 50);
				return (
					<Box key={rowKey} flexDirection="column" marginBottom={1}>
						{keys.map((key) => (
							<Text key={key}>
								<Text bold>{key}:</Text> {String(row[key])}
							</Text>
						))}
					</Box>
				);
			})}
		</Box>
	);
}
