/**
 * Create Booking - 예약 생성 (Auth)
 *
 * 4단계 플로우: 상품 선택 → 날짜 선택 → 시간 선택 → 확인 + 결제
 */
import { useState, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Clock,
  Monitor,
  MapPin,
  Repeat,
} from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { toast } from "sonner";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import {
  useProviderById,
  useAvailableSlots,
  useCreateBooking,
} from "../hooks";
import { SlotPicker } from "../components/slot-picker";

export function CreateBooking() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    providerId?: string;
    productId?: string;
  };

  const providerId = search.providerId ?? "";
  const initialProductId = search.productId ?? "";

  const [step, setStep] = useState(1);
  const [selectedProductId, setSelectedProductId] = useState(initialProductId);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [consultationMode, setConsultationMode] = useState<string>("");
  const [meetingLink, setMeetingLink] = useState("");
  const [location, setLocation] = useState("");

  const { data: provider, isLoading: providerLoading } = useProviderById(providerId);

  const selectedProduct = useMemo(
    () => provider?.products.find((p) => p.id === selectedProductId) ?? null,
    [provider, selectedProductId],
  );

  const { data: slots, isLoading: slotsLoading } = useAvailableSlots({
    providerId,
    date: selectedDate,
    durationMinutes: selectedProduct?.durationMinutes ?? 60,
  });

  const createBooking = useCreateBooking();

  const handleSubmit = () => {
    if (!selectedProductId || !selectedTime || !consultationMode) return;

    createBooking.mutate(
      {
        providerId,
        productId: selectedProductId,
        sessionDate: selectedDate,
        startTime: selectedTime,
        consultationMode: consultationMode as "online" | "offline" | "hybrid",
      },
      {
        onSuccess: (booking) => {
          toast.success("예약이 생성되었습니다.");
          navigate({
            to: "/my/bookings/$bookingId",
            params: { bookingId: booking.id },
          });
        },
        onError: (error) => {
          toast.error(error.message || "예약 생성에 실패했습니다.");
        },
      },
    );
  };

  if (providerLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-muted-foreground">상담사 정보를 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={() => navigate({ to: "/booking" })}>
          상담사 찾기
        </Button>
      </div>
    );
  }

  const canGoNext = (): boolean => {
    switch (step) {
      case 1:
        return !!selectedProductId;
      case 2:
        return !!selectedDate;
      case 3:
        return !!selectedTime;
      case 4:
        return !!consultationMode;
      default:
        return false;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* 뒤로가기 */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          navigate({
            to: "/booking/provider/$providerId",
            params: { providerId },
          })
        }
        className="gap-2"
      >
        <ArrowLeft className="size-4" />
        {provider.name}
      </Button>

      <h1 className="text-3xl font-bold">예약하기</h1>

      {/* 단계 표시 */}
      <StepIndicator currentStep={step} />

      {/* 단계별 콘텐츠 */}
      <div className="min-h-[300px]">
        {step === 1 && (
          <StepProductSelect
            products={provider.products}
            selectedId={selectedProductId}
            onSelect={setSelectedProductId}
          />
        )}
        {step === 2 && (
          <StepDateSelect
            selectedDate={selectedDate}
            onDateChange={(date) => {
              setSelectedDate(date);
              setSelectedTime(null);
            }}
          />
        )}
        {step === 3 && (
          <SlotPicker
            slots={slots ?? []}
            isLoading={slotsLoading}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            onDateChange={(date) => {
              setSelectedDate(date);
              setSelectedTime(null);
            }}
            onTimeSelect={setSelectedTime}
          />
        )}
        {step === 4 && (
          <StepConfirm
            provider={provider}
            product={selectedProduct}
            date={selectedDate}
            time={selectedTime ?? ""}
            consultationMode={consultationMode}
            meetingLink={meetingLink}
            location={location}
            onModeChange={setConsultationMode}
            onMeetingLinkChange={setMeetingLink}
            onLocationChange={setLocation}
          />
        )}
      </div>

      {/* 네비게이션 버튼 */}
      <div className="flex items-center justify-between pt-4">
        <Button
          variant="outline"
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
        >
          이전
        </Button>
        {step < 4 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canGoNext()}
          >
            다음
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!canGoNext() || createBooking.isPending}
          >
            {createBooking.isPending ? "예약 중..." : "예약 확정"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface StepIndicatorProps {
  currentStep: number;
}

function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {STEPS.map((s, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;

        return (
          <div key={s.label} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="size-4" /> : stepNum}
              </div>
              <span
                className={cn(
                  "text-sm hidden sm:inline",
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-3 h-px w-8",
                  stepNum < currentStep ? "bg-primary/40" : "bg-muted",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface StepProductSelectProps {
  products: { id: string; name: string; durationMinutes: number; price: number }[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function StepProductSelect({ products, selectedId, onSelect }: StepProductSelectProps) {
  if (products.length === 0) {
    return <p className="text-muted-foreground">등록된 상품이 없습니다.</p>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">상품 선택</h2>
      <div className="space-y-3">
        {products.map((product) => {
          const isSelected = product.id === selectedId;
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onSelect(product.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg p-4 text-left transition-colors",
                isSelected
                  ? "bg-primary/10 ring-2 ring-primary"
                  : "bg-muted/30 hover:bg-muted/50",
              )}
            >
              <div className="space-y-1">
                <h3 className="font-medium">{product.name}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="size-3.5" />
                  <span>{product.durationMinutes}분</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">{formatPrice(product.price)}</span>
                {isSelected && (
                  <div className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-4" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface StepDateSelectProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
}

function StepDateSelect({ selectedDate, onDateChange }: StepDateSelectProps) {
  const dates = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">날짜 선택</h2>
      <p className="text-sm text-muted-foreground">
        상담을 원하는 날짜를 선택하세요.
      </p>
      <div className="grid grid-cols-7 gap-2">
        {dates.map((date) => {
          const dateStr = formatDateISO(date);
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === getToday();

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onDateChange(dateStr)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg p-3 text-sm transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted/50",
                isToday && !isSelected && "ring-1 ring-primary/30",
              )}
            >
              <span className={cn("text-sm", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {WEEKDAY_LABELS[date.getDay()]}
              </span>
              <span className="text-base font-medium">{date.getDate()}</span>
              <span className={cn("text-sm", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {date.getMonth() + 1}월
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface StepConfirmProps {
  provider: { name: string; avatar: string | null; consultationMode: string };
  product: { name: string; durationMinutes: number; price: number } | null;
  date: string;
  time: string;
  consultationMode: string;
  meetingLink: string;
  location: string;
  onModeChange: (mode: string) => void;
  onMeetingLinkChange: (link: string) => void;
  onLocationChange: (loc: string) => void;
}

function StepConfirm({
  provider,
  product,
  date,
  time,
  consultationMode,
  meetingLink,
  location,
  onModeChange,
  onMeetingLinkChange,
  onLocationChange,
}: StepConfirmProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">예약 확인</h2>

      {/* 요약 정보 */}
      <div className="rounded-lg bg-muted/30 p-6 space-y-4">
        <SummaryRow label="상담사" value={provider.name} />
        {product && (
          <>
            <SummaryRow label="상품" value={product.name} />
            <SummaryRow label="시간" value={`${product.durationMinutes}분`} />
            <SummaryRow label="금액" value={formatPrice(product.price)} />
          </>
        )}
        <SummaryRow label="날짜" value={formatDate(date)} />
        <SummaryRow label="시작 시간" value={time} />
      </div>

      <Separator />

      {/* 상담 방식 선택 */}
      <div className="space-y-3">
        <label className="text-sm font-medium">상담 방식</label>
        <Select value={consultationMode} onValueChange={(v) => { if (v) onModeChange(v); }}>
          <SelectTrigger>
            <SelectValue placeholder="상담 방식을 선택하세요" />
          </SelectTrigger>
          <SelectContent>
            {provider.consultationMode === "hybrid" ? (
              <>
                <SelectItem value="online">
                  <span className="flex items-center gap-2">
                    <Monitor className="size-4" /> 온라인
                  </span>
                </SelectItem>
                <SelectItem value="offline">
                  <span className="flex items-center gap-2">
                    <MapPin className="size-4" /> 오프라인
                  </span>
                </SelectItem>
                <SelectItem value="hybrid">
                  <span className="flex items-center gap-2">
                    <Repeat className="size-4" /> 혼합
                  </span>
                </SelectItem>
              </>
            ) : (
              <SelectItem value={provider.consultationMode}>
                {provider.consultationMode === "online" ? "온라인" : "오프라인"}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* 온라인이면 미팅 링크, 오프라인이면 장소 */}
      {(consultationMode === "online" || consultationMode === "hybrid") && (
        <div className="space-y-2">
          <label htmlFor="meeting-link" className="text-sm font-medium">
            미팅 링크 (선택)
          </label>
          <Input
            id="meeting-link"
            placeholder="https://zoom.us/..."
            value={meetingLink}
            onChange={(e) => onMeetingLinkChange(e.target.value)}
          />
        </div>
      )}
      {(consultationMode === "offline" || consultationMode === "hybrid") && (
        <div className="space-y-2">
          <label htmlFor="location" className="text-sm font-medium">
            장소 (선택)
          </label>
          <Input
            id="location"
            placeholder="상담 장소를 입력하세요"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
}

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function getToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const STEPS = [
  { label: "상품 선택" },
  { label: "날짜 선택" },
  { label: "시간 선택" },
  { label: "확인" },
];

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
