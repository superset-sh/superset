/**
 * FileUploader - 드래그 앤 드롭 파일 업로더 (Base)
 *
 * hook 의존 없는 순수 컴포넌트. onUpload로 업로드 함수를 주입받습니다.
 * 각 앱에서 래핑하여 간편하게 사용:
 *
 * @example
 * // Base 직접 사용
 * import { FileUploader } from "@superbuilder/feature-ui/components/file-uploader";
 * <FileUploader onUpload={(file) => uploadFile(file)} />
 *
 * @example
 * // 앱 래퍼 사용 (권장)
 * import { FileUploader } from "@features/file-manager";
 * <FileUploader bucket="public-files" onUploadComplete={handleDone} />
 */
import { useState, useCallback } from "react";
import { Upload, X, FileIcon, Loader2 } from "lucide-react";
import { Button } from "../_shadcn/button";
import { cn } from "../lib/utils";
import { toast } from "sonner";

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface Props {
  /** 파일 1개를 업로드하는 함수. 앱별 인증/API 설정을 주입 */
  onUpload: (file: File) => Promise<any>;
  accept?: string;
  /** 최대 파일 크기 (bytes). 기본 10MB */
  maxSize?: number;
  /** 최대 파일 개수. 기본 5 */
  maxFiles?: number;
  /** 전체 업로드 완료 콜백 */
  onUploadComplete?: (files: any[]) => void;
  onError?: (error: Error) => void;
  className?: string;
}

/* -------------------------------------------------------------------------------------------------
 * Component
 * -----------------------------------------------------------------------------------------------*/

export function FileUploader({
  onUpload,
  accept,
  maxSize = 10 * 1024 * 1024,
  maxFiles = 5,
  onUploadComplete,
  onError,
  className,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (file.size > maxSize) {
        return `${file.name}: 파일 크기가 ${maxSize / 1024 / 1024}MB를 초과합니다.`;
      }
      if (accept) {
        const acceptedTypes = accept.split(",").map((t) => t.trim());
        const isAccepted = acceptedTypes.some((type) => {
          if (type.startsWith(".")) {
            return file.name.toLowerCase().endsWith(type.toLowerCase());
          }
          if (type.endsWith("/*")) {
            return file.type.startsWith(type.replace("/*", "/"));
          }
          return file.type === type;
        });
        if (!isAccepted) {
          return `${file.name}: 지원하지 않는 파일 형식입니다.`;
        }
      }
      return null;
    },
    [accept, maxSize],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const validFiles: File[] = [];

      for (const file of files) {
        const error = validateFile(file);
        if (error) {
          toast.error(error);
        } else {
          validFiles.push(file);
        }
      }

      if (validFiles.length > maxFiles) {
        toast.error(`최대 ${maxFiles}개의 파일만 업로드할 수 있습니다.`);
        return;
      }

      setPendingFiles(validFiles);
    },
    [validateFile, maxFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      addFiles(Array.from(e.target.files ?? []));
      e.target.value = "";
    },
    [addFiles],
  );

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return;

    setIsUploading(true);
    const uploadedFiles: any[] = [];

    for (const file of pendingFiles) {
      try {
        const result = await onUpload(file);
        uploadedFiles.push(result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Upload failed");
        toast.error(`${file.name}: ${err.message}`);
        onError?.(err);
      }
    }

    setIsUploading(false);

    if (uploadedFiles.length > 0) {
      toast.success(`${uploadedFiles.length}개 파일이 업로드되었습니다.`);
      onUploadComplete?.(uploadedFiles);
      setPendingFiles([]);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
        )}
      >
        <Upload className="text-muted-foreground mb-4 size-10" />
        <p className="text-muted-foreground mb-2 text-sm">
          파일을 드래그하거나 클릭하여 업로드
        </p>
        <p className="text-muted-foreground text-xs">
          최대 {maxSize / 1024 / 1024}MB, {maxFiles}개 파일
        </p>
        <label className="relative mt-4">
          <Button variant="outline" type="button">
            파일 선택
          </Button>
          <input
            type="file"
            accept={accept}
            multiple={maxFiles > 1}
            onChange={handleFileSelect}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>

      {/* Pending Files */}
      {pendingFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">업로드할 파일:</p>
          <ul className="space-y-2">
            {pendingFiles.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="bg-muted flex items-center justify-between rounded-md p-2"
              >
                <div className="flex items-center gap-2">
                  <FileIcon className="size-4" />
                  <span className="text-sm">{file.name}</span>
                  <span className="text-muted-foreground text-xs">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removePendingFile(index)}>
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button onClick={handleUpload} disabled={isUploading} className="w-full">
            {isUploading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                업로드 중...
              </>
            ) : (
              `${pendingFiles.length}개 파일 업로드`
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
