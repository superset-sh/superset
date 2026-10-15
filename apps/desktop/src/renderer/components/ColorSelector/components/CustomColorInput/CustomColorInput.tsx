import { type ComponentProps, type Ref, useEffect, useRef } from "react";

interface CustomColorInputProps
	extends Omit<ComponentProps<"input">, "type" | "value" | "onChange" | "ref"> {
	value: string;
	/** Fires once the native picker commits, not on every drag step. */
	onCommit: (color: string) => void;
	ref?: Ref<HTMLInputElement>;
}

export function CustomColorInput({
	value,
	onCommit,
	ref,
	...props
}: CustomColorInputProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const onCommitRef = useRef(onCommit);
	onCommitRef.current = onCommit;

	useEffect(() => {
		if (inputRef.current) inputRef.current.value = value;
	}, [value]);

	useEffect(() => {
		const input = inputRef.current;
		if (!input) return;
		const handleChange = () => onCommitRef.current(input.value);
		input.addEventListener("change", handleChange);
		return () => input.removeEventListener("change", handleChange);
	}, []);

	return (
		<input
			{...props}
			ref={(node) => {
				inputRef.current = node;
				if (typeof ref === "function") ref(node);
				else if (ref) ref.current = node;
			}}
			type="color"
			defaultValue={value}
		/>
	);
}
