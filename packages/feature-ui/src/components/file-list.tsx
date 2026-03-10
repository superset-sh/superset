/**
 * FileList - 파일 목록 (grid / list 뷰)
 *
 * 순수 presentational 컴포넌트. 파일 데이터를 받아 표시만 합니다.
 * @example
 * import { FileList } from "@superbuilder/feature-ui/components/file-list";
 * <FileList files={files} view="grid" onDelete={handleDelete} />
 */
import { FileIcon, Trash2, Download, Image, FileText, Film, Music } from "lucide-react";
import { Button } from "../_shadcn/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../_shadcn/table";
import { cn } from "../lib/utils";

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

export interface FileListItem {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  publicUrl: string | null;
  bucket: string;
  createdAt: string | null;
}

interface Props {
  files: FileListItem[];
  onDelete?: (id: string) => void;
  onSelect?: (file: FileListItem) => void;
  selectable?: boolean;
  deletable?: boolean;
  selectedIds?: string[];
  isLoading?: boolean;
  view?: "grid" | "list";
  className?: string;
}

/* -------------------------------------------------------------------------------------------------
 * Component
 * -----------------------------------------------------------------------------------------------*/

export function FileList({
  files,
  onDelete,
  onSelect,
  selectable = false,
  deletable = true,
  selectedIds = [],
  isLoading = false,
  view = "list",
  className,
}: Props) {
  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center justify-center py-8">
        로딩 중...
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center py-8">
        <FileIcon className="mb-2 size-10 opacity-50" />
        <p>파일이 없습니다.</p>
      </div>
    );
  }

  if (view === "grid") {
    return (
      <div
        className={cn(
          "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
          className,
        )}
      >
        {files.map((file) => (
          <div
            key={file.id}
            onClick={() => selectable && onSelect?.(file)}
            className={cn(
              "group relative flex flex-col items-center rounded-lg border p-4 transition-colors",
              selectable && "cursor-pointer hover:border-primary",
              selectedIds.includes(file.id) && "border-primary bg-primary/5",
            )}
          >
            <div className="bg-muted mb-2 flex size-16 items-center justify-center rounded-lg">
              {file.mimeType.startsWith("image/") && file.publicUrl ? (
                <img
                  src={file.publicUrl}
                  alt={file.originalName}
                  className="size-full rounded-lg object-cover"
                />
              ) : (
                getFileIcon(file.mimeType)
              )}
            </div>

            <p className="w-full truncate text-center text-sm" title={file.originalName}>
              {file.originalName}
            </p>

            <p className="text-muted-foreground text-xs">{formatFileSize(file.size)}</p>

            {deletable && (
              <Button
                variant="destructive"
                size="icon"
                className="absolute right-1 top-1 size-6 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(file.id);
                }}
              >
                <Trash2 className="size-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    );
  }

  // List view
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          <TableHead>파일명</TableHead>
          <TableHead>유형</TableHead>
          <TableHead>크기</TableHead>
          <TableHead>버킷</TableHead>
          <TableHead>업로드일</TableHead>
          {(deletable || selectable) && <TableHead className="text-right">작업</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map((file) => (
          <TableRow
            key={file.id}
            onClick={() => selectable && onSelect?.(file)}
            className={cn(
              selectable && "cursor-pointer",
              selectedIds.includes(file.id) && "bg-primary/5",
            )}
          >
            <TableCell>
              <div className="flex items-center gap-2">
                {getFileIcon(file.mimeType)}
                <span className="max-w-[200px] truncate" title={file.originalName}>
                  {file.originalName}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">{file.mimeType}</TableCell>
            <TableCell>{formatFileSize(file.size)}</TableCell>
            <TableCell>{file.bucket}</TableCell>
            <TableCell>{formatDate(file.createdAt)}</TableCell>
            {(deletable || selectable) && (
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  {file.publicUrl && (
                    <a
                      href={file.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex size-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    >
                      <Download className="size-4" />
                    </a>
                  )}
                  {deletable && (
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete?.(file.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <Image className="size-4" />;
  if (mimeType.startsWith("video/")) return <Film className="size-4" />;
  if (mimeType.startsWith("audio/")) return <Music className="size-4" />;
  if (mimeType.includes("pdf") || mimeType.includes("document"))
    return <FileText className="size-4" />;
  return <FileIcon className="size-4" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
