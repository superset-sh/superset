/**
 * File Manager Hooks - tRPC 기반
 *
 * 파일 업로드만 multipart이므로 REST fetch 유지, 나머지는 tRPC
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc";
import { API_URL, getAuthHeaders } from "../../../lib/trpc";
import type { UploadOptions } from "../types";

/**
 * Admin용 전체 파일 목록 조회
 */
export function useAdminFiles(options?: { page?: number; limit?: number }) {
  const trpc = useTRPC();
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 20;

  return useQuery(
    trpc.fileManager.admin.list.queryOptions({ page, limit })
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
 */
export function useFileUpload() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, options }: { file: File; options?: UploadOptions }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (options?.bucket) formData.append("bucket", options.bucket);
      if (options?.folder) formData.append("folder", options.folder);

      const res = await fetch(`${API_URL}/files/upload`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message ?? "파일 업로드에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.fileManager.admin.list.queryKey(),
      });
    },
  });
}

/**
 * Admin용 파일 삭제
 */
export function useAdminFileDelete() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.fileManager.admin.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.fileManager.admin.list.queryKey(),
      });
    },
  });
}
