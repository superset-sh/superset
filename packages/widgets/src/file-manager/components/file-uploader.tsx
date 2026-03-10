/**
 * FileUploader - Connected 래퍼
 *
 * uploadFile 유틸이 내장되어 있어 bucket만 지정하면 동작합니다.
 * @example
 * import { FileUploader } from "@superbuilder/widgets/file-manager";
 * <FileUploader bucket="public-files" onUploadComplete={(files) => setImages(files)} />
 */
import { FileUploader as BaseFileUploader } from "@superbuilder/feature-ui/components/file-uploader";
import { uploadFile } from "../lib/upload-file";
import type { FileRecord } from "../types";

interface Props {
  bucket?: "files" | "public-files";
  folder?: string;
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  onUploadComplete?: (files: FileRecord[]) => void;
  onError?: (error: Error) => void;
  className?: string;
}

export function FileUploader({ bucket = "files", folder, ...rest }: Props) {
  return (
    <BaseFileUploader
      onUpload={(file) => uploadFile(file, { bucket, folder })}
      {...rest}
    />
  );
}
