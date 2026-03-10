/**
 * Provider Detail - 상담사 상세 (Public)
 */
import { useParams, useNavigate } from "@tanstack/react-router";
import { Monitor, MapPin, Repeat, Clock, ArrowLeft } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { useProviderById } from "../hooks";

export function ProviderDetail() {
  const { providerId } = useParams({ strict: false });
  const navigate = useNavigate();
  const { data: provider, isLoading, error } = useProviderById(providerId ?? "");

  if (isLoading) {
    return <ProviderDetailSkeleton />;
  }

  if (error || !provider) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-muted-foreground">상담사 정보를 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={() => navigate({ to: "/booking" })}>
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  const initials = provider.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const modeConfig = CONSULTATION_MODES[provider.consultationMode];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* 뒤로가기 */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate({ to: "/booking" })}
        className="gap-2"
      >
        <ArrowLeft className="size-4" />
        상담사 목록
      </Button>

      {/* 프로필 헤더 */}
      <div className="flex items-start gap-6">
        <div className="flex size-20 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground shrink-0">
          {provider.avatar ? (
            <img
              src={provider.avatar}
              alt={provider.name}
              className="size-full rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        <div className="space-y-3">
          <div>
            <h1 className="text-3xl font-bold">{provider.name}</h1>
            {provider.experienceYears != null && (
              <p className="text-muted-foreground mt-1">
                경력 {provider.experienceYears}년
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {modeConfig && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <modeConfig.icon className="size-4" />
                {modeConfig.label}
              </div>
            )}
            {provider.languages.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {provider.languages.join(", ")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 카테고리 */}
      {provider.categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {provider.categories.map((cat) => (
            <Badge key={cat.id} variant="secondary">
              {cat.name}
            </Badge>
          ))}
        </div>
      )}

      {/* 소개 */}
      {provider.bio && (
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">소개</h2>
          <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {provider.bio}
          </p>
        </div>
      )}

      <Separator />

      {/* 상품 목록 */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">상담 상품</h2>
        {provider.products.length === 0 ? (
          <p className="text-muted-foreground">등록된 상품이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {provider.products.map((product) => (
              <ProductItem
                key={product.id}
                product={product}
                providerId={provider.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* 예약 CTA */}
      {provider.products.length > 0 && (
        <div className="pt-4">
          <Button
            size="lg"
            onClick={() =>
              navigate({
                to: "/booking/new",
                search: { providerId: provider.id },
              })
            }
          >
            예약하기
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface ProductItemProps {
  product: {
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
  };
  providerId: string;
}

function ProductItem({ product, providerId }: ProductItemProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/30 p-4">
      <div className="space-y-1">
        <h3 className="font-medium">{product.name}</h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-3.5" />
          <span>{product.durationMinutes}분</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="font-medium">
          {formatPrice(product.price)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigate({
              to: "/booking/new",
              search: { providerId, productId: product.id },
            })
          }
        >
          선택
        </Button>
      </div>
    </div>
  );
}

function ProviderDetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Skeleton className="h-8 w-32" />
      <div className="flex items-start gap-6">
        <Skeleton className="size-20 rounded-full" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-20 w-full" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-3">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const CONSULTATION_MODES: Record<
  string,
  { icon: typeof Monitor; label: string }
> = {
  online: { icon: Monitor, label: "온라인 상담" },
  offline: { icon: MapPin, label: "오프라인 상담" },
  hybrid: { icon: Repeat, label: "온/오프라인 혼합" },
};
