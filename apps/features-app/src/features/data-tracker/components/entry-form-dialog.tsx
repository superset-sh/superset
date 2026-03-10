/**
 * EntryFormDialog - 데이터 엔트리 추가/수정 다이얼로그
 *
 * 트래커 컬럼 정의에 따라 동적으로 입력 폼을 생성합니다.
 */
import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { useAddEntry, useUpdateEntry } from "../hooks";

interface ColumnInfo {
  id: string;
  key: string;
  label: string;
  dataType: "text" | "number";
  isRequired: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackerId: string;
  columns: ColumnInfo[];
  editEntry?: {
    id: string;
    date: Date | string;
    data: Record<string, string | number>;
  } | null;
}

export function EntryFormDialog({
  open,
  onOpenChange,
  trackerId,
  columns,
  editEntry,
}: Props) {
  const addEntry = useAddEntry();
  const updateEntry = useUpdateEntry();

  const isEditing = !!editEntry;

  const [dateValue, setDateValue] = useState("");
  const [formData, setFormData] = useState<Record<string, string | number>>({});

  useEffect(() => {
    if (open) {
      if (editEntry) {
        const entryDate =
          typeof editEntry.date === "string"
            ? new Date(editEntry.date)
            : editEntry.date;
        setDateValue(format(entryDate, "yyyy-MM-dd"));
        setFormData({ ...editEntry.data });
      } else {
        setDateValue(format(new Date(), "yyyy-MM-dd"));
        const initial: Record<string, string | number> = {};
        for (const col of columns) {
          initial[col.key] = col.dataType === "number" ? 0 : "";
        }
        setFormData(initial);
      }
    }
  }, [open, editEntry, columns]);

  const handleFieldChange = (key: string, value: string, dataType: string) => {
    setFormData((prev) => ({
      ...prev,
      [key]: dataType === "number" ? (value === "" ? 0 : Number(value)) : value,
    }));
  };

  const handleSubmit = async () => {
    const date = new Date(dateValue);

    if (isEditing && editEntry) {
      await updateEntry.mutateAsync({
        entryId: editEntry.id,
        date,
        data: formData,
      });
    } else {
      await addEntry.mutateAsync({
        trackerId,
        date,
        data: formData,
      });
    }

    onOpenChange(false);
  };

  const isSubmitting = addEntry.isPending || updateEntry.isPending;

  const isValid =
    dateValue !== "" &&
    columns
      .filter((col) => col.isRequired)
      .every((col) => {
        const val = formData[col.key];
        if (val === undefined || val === null) return false;
        if (typeof val === "string" && val.trim() === "") return false;
        return true;
      });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "데이터 수정" : "데이터 입력"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "기존 데이터를 수정합니다."
              : "새로운 데이터를 입력합니다."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Date field */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="entry-date">날짜</Label>
            <Input
              id="entry-date"
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
            />
          </div>

          {/* Dynamic column fields */}
          {columns.map((col) => (
            <div key={col.id} className="flex flex-col gap-2">
              <Label htmlFor={`col-${col.key}`}>
                {col.label}
                {col.isRequired && (
                  <span className="text-destructive ml-1">*</span>
                )}
              </Label>
              <Input
                id={`col-${col.key}`}
                type={col.dataType === "number" ? "number" : "text"}
                value={formData[col.key] ?? ""}
                onChange={(e) =>
                  handleFieldChange(col.key, e.target.value, col.dataType)
                }
                placeholder={col.label}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting
              ? "저장 중..."
              : isEditing
                ? "수정"
                : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
