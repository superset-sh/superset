import { Box, Text } from "ink";
import React from "react";

interface TableProps {
	data: Record<string, any>[];
}

export default function Table({ data }: TableProps) {
	if (!data || data.length === 0) {
		return null;
	}

	const keys = Object.keys(data[0]!);

	return (
		<Box flexDirection="column">
			{data.map((row, index) => (
				<Box
					key={index}
					flexDirection="column"
					marginBottom={index < data.length - 1 ? 1 : 0}
				>
					{keys.map((key) => (
						<Text key={key}>
							<Text bold>{key}:</Text> {String(row[key])}
						</Text>
					))}
				</Box>
			))}
		</Box>
	);
}
