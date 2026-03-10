import { useEffect } from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Checkbox } from "@superbuilder/feature-ui/shadcn/checkbox";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@superbuilder/feature-ui/shadcn/form";
import { toast } from "sonner";
import {
  useAdminCatalogFeatures,
  useCreateCatalogFeature,
  useUpdateCatalogFeature,
} from "../hooks";

/* Types */
interface CatalogAdminFormProps {
  editingId: string | null;
  onComplete: () => void;
}

/* Constants */
const GROUP_OPTIONS = [
  { value: "core", label: "Core" },
  { value: "content", label: "Content" },
  { value: "commerce", label: "Commerce" },
  { value: "system", label: "System" },
] as const;

const formSchema = z.object({
  slug: z
    .string()
    .min(1, "Slug은 필수입니다")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "소문자, 숫자, 하이픈만 사용 가능"),
  name: z.string().min(1, "이름은 필수입니다").max(200),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
  group: z.enum(["core", "content", "commerce", "system"]),
  tags: z.string().optional(),
  capabilities: z.string().optional(),
  techStackServer: z.string().optional(),
  techStackClient: z.string().optional(),
  isCore: z.boolean(),
  isPublished: z.boolean(),
  order: z.number().int(),
});

type FormValues = z.infer<typeof formSchema>;

export function CatalogAdminForm({ editingId, onComplete }: CatalogAdminFormProps) {
  const { data: features } = useAdminCatalogFeatures();
  const createMutation = useCreateCatalogFeature();
  const updateMutation = useUpdateCatalogFeature();

  const editingFeature = editingId
    ? features?.find((f: { id: string }) => f.id === editingId)
    : null;

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(formSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  useEffect(() => {
    if (editingFeature) {
      form.reset({
        slug: editingFeature.slug,
        name: editingFeature.name,
        description: editingFeature.description ?? "",
        icon: editingFeature.icon ?? "",
        group: editingFeature.group,
        tags: (editingFeature.tags ?? []).join(", "),
        capabilities: (editingFeature.capabilities ?? []).join(", "),
        techStackServer: (editingFeature.techStack?.server ?? []).join(", "),
        techStackClient: (editingFeature.techStack?.client ?? []).join(", "),
        isCore: editingFeature.isCore,
        isPublished: editingFeature.isPublished,
        order: editingFeature.order,
      });
    } else {
      form.reset(EMPTY_DEFAULTS);
    }
  }, [editingFeature, form]);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const handleNameChange = (name: string) => {
    form.setValue("name", name);
    if (!editingId) {
      form.setValue("slug", generateSlug(name));
    }
  };

  const parseCommaSeparated = (value: string | undefined): string[] => {
    if (!value) return [];
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const onSubmit = async (data: FormValues) => {
    const payload = {
      slug: data.slug,
      name: data.name,
      description: data.description || undefined,
      icon: data.icon || undefined,
      group: data.group,
      tags: parseCommaSeparated(data.tags),
      capabilities: parseCommaSeparated(data.capabilities),
      techStack: {
        server: parseCommaSeparated(data.techStackServer),
        client: parseCommaSeparated(data.techStackClient),
      },
      isCore: data.isCore,
      isPublished: data.isPublished,
      order: data.order,
    };

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data: payload });
        toast.success("Feature가 수정되었습니다");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Feature가 등록되었습니다");
      }
      form.reset(EMPTY_DEFAULTS);
      onComplete();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "저장에 실패했습니다";
      toast.error(message);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {editingId ? "Feature 수정" : "새 Feature 등록"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>이름</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Feature 이름"
                        onChange={(e) => handleNameChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="feature-slug"
                        disabled={!!editingId}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>설명</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Feature에 대한 설명을 입력하세요"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>아이콘 (Lucide)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Package" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="group"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>그룹</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="그룹 선택" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GROUP_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>정렬 순서</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value, 10) || 0)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Tags & Capabilities */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>태그 (쉼표 구분)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="blog, cms, content"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="capabilities"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>기능 (쉼표 구분)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="CRUD, 검색, 필터링"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Tech Stack */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="techStackServer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>서버 기술 (쉼표 구분)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="NestJS, Drizzle, tRPC"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="techStackClient"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>클라이언트 기술 (쉼표 구분)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="React, TanStack Query"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Flags */}
            <div className="flex items-center gap-8">
              <FormField
                control={form.control}
                name="isCore"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <Label>Core Feature</Label>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isPublished"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <Label>발행 (공개)</Label>
                  </FormItem>
                )}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onComplete}
              >
                취소
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "저장 중..."
                  : editingId
                    ? "수정"
                    : "등록"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

/* Constants */
const EMPTY_DEFAULTS: FormValues = {
  slug: "",
  name: "",
  description: "",
  icon: "",
  group: "content",
  tags: "",
  capabilities: "",
  techStackServer: "",
  techStackClient: "",
  isCore: false,
  isPublished: false,
  order: 0,
};
