import { Box, Text, useApp, useInput } from "ink";
import React, { useEffect, useState } from "react";

type Props = {
	name: string | undefined;
};

export default function App({ name = "Stranger" }: Props) {
	const [counter, setCounter] = useState(0);
	const [input, setInput] = useState("");
	const { exit } = useApp();

	useEffect(() => {
		const timer = setInterval(() => {
			setCounter((c) => c + 1);
		}, 1000);

		return () => clearInterval(timer);
	}, []);

	useInput((input, key) => {
		if (key.escape || (key.ctrl && input === "c")) {
			exit();
		}

		if (key.return) {
			setInput("");
		} else if (key.backspace || key.delete) {
			setInput((prev) => prev.slice(0, -1));
		} else if (!key.ctrl && !key.meta) {
			setInput((prev) => prev + input);
		}
	});

	return (
		<Box
			flexDirection="column"
			padding={1}
			borderStyle="round"
			borderColor="red"
		>
			<Text>
				👋 Welcome,{" "}
				<Text color="red" bold>
					{name}
				</Text>
				! 🚀
			</Text>
			<Text color="green">⏱️ Runtime: {counter}s</Text>
			<Box marginTop={1}>
				<Text>
					Type something:{" "}
					<Text color="yellow" bold>
						{input}
					</Text>
				</Text>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>Press ESC or Ctrl+C to exit</Text>
			</Box>
		</Box>
	);
}
