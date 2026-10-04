import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useMemo } from "react";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import type { ViewProps } from "../../types";
import { WorkbookViewer } from "./components/WorkbookViewer";
import { useWorkbook } from "./hooks/useWorkbook";
import type { WorkbookSource } from "./types";

export function SpreadsheetView({
	document,
	filePath,
	isActive,
	embedded = false,
	onChangeView,
}: ViewProps) {
	const { t } = useLingui();
	const { content } = document;
	const source = useMemo<WorkbookSource | null>(() => {
		if (content.kind === "bytes") {
			return { kind: "bytes", bytes: content.value, fileName: filePath };
		}
		if (content.kind === "text") {
			return { kind: "text", text: content.value, fileName: filePath };
		}
		return null;
	}, [content, filePath]);
	const workbook = useWorkbook(source);

	if (content.kind === "not-found") {
		return <ErrorState reason="not-found" />;
	}
	if (workbook.status === "loading") {
		return <LoadingState />;
	}
	if (workbook.status === "error") {
		const detail =
			workbook.reason === "password"
				? t`This file is password protected`
				: workbook.reason === "unsupported"
					? t`This file format is not supported`
					: undefined;
		return (
			<ErrorState
				reason="load-failed"
				message={t`This file could not be read as a spreadsheet`}
				detail={detail}
				action={
					source?.kind === "text" && !embedded ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() => onChangeView("code")}
						>
							<Trans>Show raw</Trans>
						</Button>
					) : undefined
				}
			/>
		);
	}

	return (
		<WorkbookViewer
			client={workbook.client}
			sheets={workbook.sheets}
			isActive={isActive}
			embedded={embedded}
		/>
	);
}
