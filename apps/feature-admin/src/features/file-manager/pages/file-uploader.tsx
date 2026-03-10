/**
 * FileUploader - Admin 앱용 간편 래퍼
 *
 * useFileUpload hook이 내장되어 있어 bucket만 지정하면 동작합니다.
 * 업로드 완료 시 admin 파일 목록 캐시를 자동 무효화합니다.
 * @example
 * import { FileUploader } from "@features/file-manager";
 * <FileUploader bucket="public-files" onUploadComplete={(files) => setImages(files)} />
 */
import { FileUploader as BaseFileUploader } from "@superbuilder/feature-ui/components/file-uploader";
import { useFileUpload } from "../hooks";
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
  const { mutateAsync: upload } = useFileUpload();

  return (
    <BaseFileUploader
      onUpload={(file) => upload({ file, options: { bucket, folder } })}
      {...rest}
    />
  );
}
