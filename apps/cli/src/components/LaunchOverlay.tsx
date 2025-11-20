import { Box, Text } from "ink";
import React from "react";

interface LaunchOverlayProps {
	agentType: string;
	sessionName: string;
}

/**
 * Animated loading overlay shown while launching/attaching to agent session
 * Displays a breathing animation with gradient colors
 */
export function LaunchOverlay({ agentType, sessionName }: LaunchOverlayProps) {
	const [frame, setFrame] = React.useState(0);

	// Braille spinner frames for smooth animation
	const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

	// Breathing dots animation
	const breathingFrames = [
		"●",
		"●○",
		"●○○",
		"○●○",
		"○○●",
		"○●",
		"●",
		"",
	];

	React.useEffect(() => {
		const interval = setInterval(() => {
			setFrame((prev) => (prev + 1) % spinnerFrames.length);
		}, 80);

		return () => clearInterval(interval);
	}, [spinnerFrames.length]);

	const spinner = spinnerFrames[frame];
	const breathing = breathingFrames[frame % breathingFrames.length];

	return (
		<Box
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			height="100%"
		>
			<Box marginBottom={1}>
				<Text color="cyan" bold>
					{spinner} Launching {agentType}
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text color="blue">{breathing}</Text>
			</Box>

			<Box>
				<Text dimColor>Session: {sessionName}</Text>
			</Box>

			<Box marginTop={2}>
				<Text dimColor italic>
					Please wait...
				</Text>
			</Box>
		</Box>
	);
}
