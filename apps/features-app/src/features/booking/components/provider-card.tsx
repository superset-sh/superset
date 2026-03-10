/**
 * Provider Card
 *
 * 상담사 카드 (탐색 결과에 표시)
 */
import { Link } from "@tanstack/react-router";
import { Monitor, MapPin, Repeat } from "lucide-react";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface Props {
  provider: {
    id: string;
    name: string;
    avatar: string | null;
    bio: string | null;
    experienceYears: number | null;
    consultationMode: string;
    languages: string[];
    categories: { id: string; name: string; slug: string; icon: string | null }[];
    products: { id: string; name: string; durationMinutes: number; price: number }[];
  };
  className?: string;
}

export function ProviderCard({ provider, className }: Props) {
  const priceRange = getPriceRange(provider.products);
  const initials = getInitials(provider.name);
  const modeIcon = CONSULTATION_MODE_ICON[provider.consultationMode] ?? null;

  return (
    <Link
      to="/booking/provider/$providerId"
      params={{ providerId: provider.id }}
      className={cn(
        "group block rounded-lg border bg-background hover:border-primary/50 transition-colors",
        className,
      )}
    >
      <div className="p-6 space-y-4">
        {/* 프로필 헤더 */}
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-lg font-medium text-muted-foreground shrink-0">
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
          <div className="min-w-0">
            <h3 className="text-lg font-medium group-hover:text-primary transition-colors truncate">
              {provider.name}
            </h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {provider.experienceYears != null && (
                <span>경력 {provider.experienceYears}년</span>
              )}
              {modeIcon && (
                <span className="flex items-center gap-1">
                  <modeIcon.icon className="size-3.5" />
                  {modeIcon.label}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 카테고리 뱃지 */}
        {provider.categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {provider.categories.slice(0, 3).map((cat) => (
              <Badge key={cat.id} variant="secondary">
                {cat.name}
              </Badge>
            ))}
            {provider.categories.length > 3 && (
              <Badge variant="secondary">+{provider.categories.length - 3}</Badge>
            )}
          </div>
        )}

        {/* 소개 */}
        {provider.bio && (
          <p className="text-sm text-muted-foreground line-clamp-2">{provider.bio}</p>
        )}

        {/* 하단 정보 */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {provider.languages.join(", ")}
          </span>
          {priceRange && (
            <span className="font-medium text-foreground">{priceRange}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getPriceRange(
  products: { price: number }[],
): string | null {
  if (products.length === 0) return null;
  const prices = products.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const fmt = (n: number) => new Intl.NumberFormat("ko-KR").format(n) + "원";
  if (min === max) return fmt(min);
  return `${fmt(min)} ~ ${fmt(max)}`;
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const CONSULTATION_MODE_ICON: Record<
  string,
  { icon: typeof Monitor; label: string }
> = {
  online: { icon: Monitor, label: "온라인" },
  offline: { icon: MapPin, label: "오프라인" },
  hybrid: { icon: Repeat, label: "혼합" },
};
