/**
 * File Manager Hooks - tRPC 기반
 *
 * 다른 feature에서 파일 관련 기능을 사용할 수 있도록 제공
 * 파일 업로드만 multipart이므로 REST fetch 유지, 나머지는 tRPC
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@superbuilder/features-client/trpc-client";
import { uploadFile } from "../lib/upload-file";
import type { UploadOptions } from "../types";

/**
 * 내 파일 목록 조회
 */
export function useFiles(options?: { page?: number; limit?: number }) {
  const trpc = useTRPC();
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 20;

  return useQuery(
    trpc.fileManager.list.queryOptions({ page, limit })
  );
}

/**
 * ID로 파일 조회
 */
export function useFileById(id: string) {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.fileManager.byId.queryOptions({ id }),
    enabled: !!id,
  });
}

/**
 * 파일 업로드 (multipart/form-data → REST 유지)
 * 내부적으로 uploadFile 유틸 사용
 */
export function useFileUpload() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, options }: { file: File; options?: UploadOptions }) =>
      uploadFile(file, options),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.fileManager.list.queryKey(),
      });
    },
  });
}

/**
 * 내 파일 삭제
 */
export function useFileDelete() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.fileManager.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.fileManager.list.queryKey(),
      });
    },
  });
}

/**
 * Signed URL 발급
 */
export function useSignedUrl(id: string) {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.fileManager.signedUrl.queryOptions({ id }),
    enabled: !!id,
    staleTime: 30 * 60 * 1000, // 30분
  });
}
