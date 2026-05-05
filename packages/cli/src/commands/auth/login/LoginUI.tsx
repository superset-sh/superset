import { Box, Text, useInput, usePaste } from "ink";
import { useEffect, useState } from "react";

export type LoginStatus = "starting" | "waiting" | "exchanging" | "done";

export interface LoginUIProps {
	url: string | null;
	status: LoginStatus;
	onSubmit: (code: string) => void;
	onCancel: () => void;
	onCopy: () => Promise<boolean>;
}

export function LoginUI({
	url,
	status,
	onSubmit,
	onCancel,
	onCopy,
}: LoginUIProps) {
	const [value, setValue] = useState("");
	const [validationError, setValidationError] = useState<string | null>(null);
	const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

	useEffect(() => {
		if (copyState !== "copied") return;
		const id = setTimeout(() => setCopyState("idle"), 1500);
		return () => clearTimeout(id);
	}, [copyState]);

	useInput((input, key) => {
		if (status === "exchanging" || status === "done") return;

		if (key.escape || (key.ctrl && input === "c")) {
			onCancel();
			return;
		}

		if (key.return) {
			const submitted = value.trim();
			if (!submitted.includes("#")) {
				setValidationError("Paste the entire value");
				return;
			}
			setValidationError(null);
			onSubmit(submitted);
			return;
		}

		if (key.backspace || key.delete) {
			setValue((v) => v.slice(0, -1));
			setValidationError(null);
			return;
		}

		// `c` keybinding for copy — fires only when the buffer is empty so
		// pasted/typed codes aren't hijacked. usePaste handles multi-char
		// paste content separately, so this only races single-key 'c' typing.
		if (input === "c" && !key.ctrl && !key.meta && value.length === 0 && url) {
			void onCopy().then((ok) => {
				if (ok) setCopyState("copied");
			});
			return;
		}

		if (input && !key.ctrl && !key.meta) {
			setValue((v) => v + input);
			setValidationError(null);
		}
	});

	usePaste((text) => {
		setValue((v) => v + text.replace(/[\r\n]+/g, ""));
		setValidationError(null);
	});

	const showCursor = status === "waiting";

	return (
		<Box flexDirection="column">
			<Text bold>superset auth login</Text>
			<Text> </Text>
			<Box flexDirection="row">
				<Text>Browser didn't open? Use the url below to sign in </Text>
				<Text dimColor>(press c to copy)</Text>
			</Box>
			<Text> </Text>
			<Text color="cyan">{url ?? "Generating sign-in link…"}</Text>
			<Text> </Text>
			<Box flexDirection="row">
				<Text>Paste code here if prompted </Text>
				<Text color="cyan">{">"}</Text>
				<Text> {value}</Text>
				{showCursor && <Text inverse> </Text>}
			</Box>
			{validationError ? <Text color="red">{validationError}</Text> : null}
			{copyState === "copied" ? (
				<Text color="green">✓ URL copied to clipboard</Text>
			) : (
				<Text> </Text>
			)}
			<Text> </Text>
			<Text dimColor italic>
				Esc / Ctrl+C to cancel
			</Text>
			{status === "exchanging" ? <Text dimColor>Signing in…</Text> : null}
		</Box>
	);
}
