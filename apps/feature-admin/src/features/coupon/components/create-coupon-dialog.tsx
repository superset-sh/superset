import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@superbuilder/feature-ui/shadcn/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@superbuilder/feature-ui/shadcn/form";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useTRPC } from "@/lib/trpc";

const createCouponFormSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Z0-9_-]+$/, "코드는 영문 대문자, 숫자, -, _ 만 허용"),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  discountPercent: z.number().int().min(1).max(100),
  durationMonths: z.number().int().min(1).max(36),
  applicablePlans: z.array(z.string()).optional(),
  maxRedemptions: z.number().int().min(1).optional(),
  startsAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
});

type CreateCouponFormValues = z.infer<typeof createCouponFormSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateCouponDialog({ open, onOpenChange }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<CreateCouponFormValues>({
    resolver: standardSchemaResolver(createCouponFormSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      discountPercent: 10,
      durationMonths: 3,
      startsAt: new Date().toISOString(),
    },
  });

  const createMutation = useMutation(trpc.coupon.admin.create.mutationOptions());

  const onSubmit = (data: CreateCouponFormValues) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.coupon.admin.list.queryKey(),
        });
        onOpenChange(false);
        form.reset();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>쿠폰 생성</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>쿠폰 코드</FormLabel>
                  <FormControl>
                    <Input placeholder="WELCOME30" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>쿠폰 이름</FormLabel>
                  <FormControl>
                    <Input placeholder="신규 가입 할인" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>설명 (선택)</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="discountPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>할인율 (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="durationMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>적용 기간 (개월)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={36}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="maxRedemptions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>최대 사용 횟수 (비워두면 무제한)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value ? Number(e.target.value) : undefined)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="startsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>유효 시작일</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      {...field}
                      value={toDatetimeLocalValue(field.value)}
                      onChange={(e) =>
                        field.onChange(e.target.value ? new Date(e.target.value).toISOString() : "")
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expiresAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>만료일 (비워두면 무기한)</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      {...field}
                      value={field.value ? toDatetimeLocalValue(field.value) : ""}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value ? new Date(e.target.value).toISOString() : undefined,
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "생성 중..." : "생성"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* Helpers */

/**
 * ISO 8601 문자열을 datetime-local input의 value 형식으로 변환
 */
function toDatetimeLocalValue(isoString: string): string {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  } catch {
    return "";
  }
}
