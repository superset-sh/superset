"use client";

import { cn } from "@superset/ui/lib/utils";
import type { MDEditorProps } from "@uiw/react-md-editor";
import MDEditor from "@uiw/react-md-editor";
import { forwardRef } from "react";

export interface MarkdownEditorProps
	extends Omit<MDEditorProps, "onChange" | "value"> {
	value?: string;
	onChange?: (value: string) => void;
	className?: string;
	/** Preview mode: "edit" (default), "live" (side-by-side), "preview" (read-only) */
	previewMode?: "edit" | "live" | "preview";
}

const MarkdownEditor = forwardRef<HTMLDivElement, MarkdownEditorProps>(
	({ value, onChange, className, previewMode = "live", ...props }, ref) => {
		return (
			<div ref={ref} data-color-mode="light" className={cn(className)}>
				<MDEditor
					value={value}
					onChange={(val) => onChange?.(val ?? "")}
					preview={previewMode}
					hideToolbar={false}
					{...props}
				/>
			</div>
		);
	},
);

MarkdownEditor.displayName = "MarkdownEditor";

export { MarkdownEditor };
