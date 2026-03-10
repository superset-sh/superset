/**
 * CsvImportDialog - CSV 데이터 가져오기 다이얼로그
 *
 * CSV 텍스트를 붙여넣거나 파일을 업로드하여 데이터를 일괄 가져옵니다.
 */
import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@superbuilder/feature-ui/shadcn/table";
import { Upload, FileText } from "lucide-react";
import { useImportCsv } from "../hooks";

interface ColumnInfo {
  id: string;
  key: string;
  label: string;
  dataType: "text" | "number";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackerId: string;
  columns: ColumnInfo[];
}

export function CsvImportDialog({
  open,
  onOpenChange,
  trackerId,
  columns,
}: Props) {
  const importCsv = useImportCsv();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvText, setCsvText] = useState("");
  const [parsedRows, setParsedRows] = useState<
    { date: Date; data: Record<string, string | number> }[]
  >([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleParse = () => {
    setParseError(null);
    try {
      const rows = parseCsv(csvText, columns);
      setParsedRows(rows);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "CSV 파싱에 실패했습니다.");
      setParsedRows([]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setCsvText(text);
    };
    reader.readAsText(file);

    // Reset file input
    e.target.value = "";
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) return;

    await importCsv.mutateAsync({
      trackerId,
      rows: parsedRows,
    });

    setCsvText("");
    setParsedRows([]);
    setParseError(null);
    onOpenChange(false);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCsvText("");
      setParsedRows([]);
      setParseError(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>CSV 가져오기</DialogTitle>
          <DialogDescription>
            CSV 형식의 데이터를 붙여넣거나 파일을 업로드하세요.
            첫 행은 헤더(date, {columns.map((c) => c.key).join(", ")})여야
            합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* CSV Input */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="csv-input">CSV 데이터</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 size-4" />
                  파일 업로드
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            </div>
            <textarea
              id="csv-input"
              className="flex min-h-32 w-full rounded-md border bg-muted px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={`date,${columns.map((c) => c.key).join(",")}\n2025-01-01,value1,value2`}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleParse}
              disabled={!csvText.trim()}
              className="self-start"
            >
              <FileText className="mr-2 size-4" />
              미리보기
            </Button>
          </div>

          {/* Parse Error */}
          {parseError && (
            <p className="text-sm text-destructive">{parseError}</p>
          )}

          {/* Preview */}
          {parsedRows.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {parsedRows.length}건의 데이터가 파싱되었습니다.
              </p>
              <div className="max-h-48 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>날짜</TableHead>
                      {columns.map((col) => (
                        <TableHead key={col.id}>{col.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 10).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {row.date.toISOString().split("T")[0]}
                        </TableCell>
                        {columns.map((col) => (
                          <TableCell key={col.id}>
                            {row.data[col.key] != null
                              ? String(row.data[col.key])
                              : "-"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {parsedRows.length > 10 && (
                <p className="text-sm text-muted-foreground">
                  ... 외 {parsedRows.length - 10}건
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={importCsv.isPending}
          >
            취소
          </Button>
          <Button
            onClick={handleImport}
            disabled={parsedRows.length === 0 || importCsv.isPending}
          >
            {importCsv.isPending
              ? "가져오는 중..."
              : `${parsedRows.length}건 가져오기`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function parseCsv(
  text: string,
  columns: ColumnInfo[],
): { date: Date; data: Record<string, string | number> }[] {
  const lines = text
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error("헤더와 최소 1행의 데이터가 필요합니다.");
  }

  const headers = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const dateIdx = headers.indexOf("date");

  if (dateIdx === -1) {
    throw new Error("'date' 컬럼을 찾을 수 없습니다.");
  }

  const columnKeySet = new Set(columns.map((c) => c.key));
  const columnTypeMap = new Map(columns.map((c) => [c.key, c.dataType]));

  const rows: { date: Date; data: Record<string, string | number> }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]!.split(",").map((v) => v.trim());

    const dateStr = values[dateIdx];
    if (!dateStr) {
      throw new Error(`${i + 1}행: 날짜가 비어있습니다.`);
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error(`${i + 1}행: 날짜 형식이 올바르지 않습니다 (${dateStr}).`);
    }

    const data: Record<string, string | number> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j]!;
      if (header === "date") continue;

      if (columnKeySet.has(header)) {
        const value = values[j] ?? "";
        const dataType = columnTypeMap.get(header);
        data[header] =
          dataType === "number" ? (value === "" ? 0 : Number(value)) : value;
      }
    }

    rows.push({ date, data });
  }

  return rows;
}
