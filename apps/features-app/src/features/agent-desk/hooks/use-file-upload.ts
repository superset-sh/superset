import { useState, useCallback, useRef } from "react";
import { uploadFile } from "@superbuilder/widgets/file-manager";
import { useConfirmUpload, useParseFile, useFiles } from "./use-agent-desk";
import { toast } from "sonner";
import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";

interface UploadingFile {
  id: string;
  name: string;
  progress: "uploading" | "confirming" | "parsing" | "done" | "error";
  error?: string;
}

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/markdown",
  "text/plain",
];

const ACCEPTED_EXTENSIONS = ".pdf,.pptx,.png,.jpg,.jpeg,.webp,.gif,.md,.txt";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function useFileUpload(sessionId: string) {
  const { t } = useFeatureTranslation("agent-desk");
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const confirmUpload = useConfirmUpload();
  const parseFile = useParseFile();
  const { refetch: refetchFiles } = useFiles(sessionId);

  const updateFile = useCallback((id: string, update: Partial<UploadingFile>) => {
    setUploadingFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...update } : f)),
    );
  }, []);

  const removeUploadingFile = useCallback((id: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const upload = useCallback(async (files: File[]) => {
    const validFiles: File[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t("fileSizeExceeded", { name: file.name }));
        continue;
      }
      if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(md|txt)$/i)) {
        const ext = file.name.split(".").pop() ?? "";
        toast.error(t("fileTypeUnsupported", { ext }));
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    const newUploading: UploadingFile[] = validFiles.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      progress: "uploading" as const,
    }));

    setUploadingFiles((prev) => [...prev, ...newUploading]);

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i]!;
      const trackingId = newUploading[i]!.id;

      try {
        updateFile(trackingId, { progress: "uploading" });

        const record = await uploadFile(file, {
          bucket: "files",
          folder: `agent-desk/${sessionId}`,
        });

        updateFile(trackingId, { progress: "confirming" });

        const confirmed = await confirmUpload.mutateAsync({
          sessionId,
          fileName: record.name,
          originalName: record.originalName,
          mimeType: record.mimeType,
          size: record.size,
          storageUrl: record.url,
        });

        updateFile(trackingId, { progress: "parsing" });

        try {
          await parseFile.mutateAsync({ fileId: confirmed.id });
        } catch {
          toast.warning(t("fileParseFailed"));
        }

        updateFile(trackingId, { progress: "done" });
        await refetchFiles();

        setTimeout(() => removeUploadingFile(trackingId), 1000);
      } catch (error) {
        const msg = error instanceof Error ? error.message : t("uploadFailed");
        updateFile(trackingId, { progress: "error", error: msg });
        setTimeout(() => removeUploadingFile(trackingId), 5000);
      }
    }
  }, [sessionId, confirmUpload, parseFile, refetchFiles, updateFile, removeUploadingFile, t]);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      upload(Array.from(files));
    }
    if (e.target) e.target.value = "";
  }, [upload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      upload(Array.from(files));
    }
  }, [upload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return {
    uploadingFiles,
    fileInputRef,
    openFileDialog,
    handleFileChange,
    handleDrop,
    handleDragOver,
    upload,
    acceptedExtensions: ACCEPTED_EXTENSIONS,
  };
}
