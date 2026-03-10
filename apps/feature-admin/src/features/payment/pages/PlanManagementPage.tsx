import { useState } from 'react';
import { PageHeader } from '@superbuilder/feature-ui/components/page-header';
import { Card, CardContent } from '@superbuilder/feature-ui/shadcn/card';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import { Input } from '@superbuilder/feature-ui/shadcn/input';
import { Label } from '@superbuilder/feature-ui/shadcn/label';
import { Textarea } from '@superbuilder/feature-ui/shadcn/textarea';
import { Switch } from '@superbuilder/feature-ui/shadcn/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@superbuilder/feature-ui/shadcn/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@superbuilder/feature-ui/shadcn/select';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';
import { ExternalLink, Edit, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { usePlans, useUpdatePlan, useSyncPlans, usePushPlansToProvider } from '../hooks/use-plan-management';

export function PlanManagementPage() {
  const { data: plans, isLoading } = usePlans();
  const updatePlan = useUpdatePlan();
  const { sync: syncPlans, isPending: isSyncing } = useSyncPlans();
  const { push: pushToLS, isPending: isPushing } = usePushPlansToProvider();
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  // 폼 상태
  const [formData, setFormData] = useState<PlanFormData>(INITIAL_FORM_DATA);

  const resetForm = () => {
    setFormData(INITIAL_FORM_DATA);
  };

  const handleOpenEdit = (plan: PlanItem) => {
    setFormData({
      name: plan.name,
      slug: plan.slug,
      description: plan.description ?? '',
      tier: plan.tier,
      monthlyCredits: plan.monthlyCredits,
      price: plan.price,
      currency: plan.currency ?? 'USD',
      interval: plan.interval ?? 'month',
      providerProductId: plan.providerProductId ?? '',
      providerVariantId: plan.providerVariantId ?? '',
      features: (plan.features as string[] | null)?.join(', ') ?? '',
      isPerSeat: plan.isPerSeat,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
    });
    setEditingPlanId(plan.id);
  };

  const handleSubmitEdit = () => {
    if (!editingPlanId) return;
    if (!formData.name.trim() || !formData.slug.trim()) {
      toast.error('이름과 슬러그를 입력해주세요.');
      return;
    }

    const featuresArray = formData.features
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);

    updatePlan.mutate(
      {
        id: editingPlanId,
        data: {
          name: formData.name,
          slug: formData.slug,
          description: formData.description || undefined,
          tier: formData.tier,
          monthlyCredits: formData.monthlyCredits,
          price: formData.price,
          currency: formData.currency,
          interval: formData.interval,
          providerProductId: formData.providerProductId || undefined,
          providerVariantId: formData.providerVariantId || undefined,
          features: featuresArray.length > 0 ? featuresArray : undefined,
          isPerSeat: formData.isPerSeat,
          isActive: formData.isActive,
          sortOrder: formData.sortOrder,
        },
      },
      {
        onSuccess: () => {
          toast.success('플랜이 수정되었습니다.');
          setEditingPlanId(null);
          resetForm();
        },
        onError: (error) => {
          toast.error(error.message || '플랜 수정에 실패했습니다.');
        },
      },
    );
  };

  return (
    <div className="container mx-auto py-8">
      <PageHeader
        title="플랜 관리"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const result = await syncPlans();
                  const msgs = [`생성 ${result.created}개`, `업데이트 ${result.updated}개`];
                  if (result.deleted > 0) msgs.push(`삭제 ${result.deleted}개`);
                  toast.success(`LS→DB 완료: ${msgs.join(', ')}`);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'LS→DB 동기화에 실패했습니다.');
                }
              }}
              disabled={isSyncing}
            >
              <RefreshCw className={`mr-2 size-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? '동기화 중...' : 'LS → DB'}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const result = await pushToLS();
                  const msgs = [`업데이트 ${result.updated}개`];
                  if (result.notLinked > 0) msgs.push(`미연동 ${result.notLinked}개`);
                  if (result.skipped > 0) msgs.push(`스킵 ${result.skipped}개`);
                  toast.success(`DB→LS 완료: ${msgs.join(', ')}`);
                  if (result.notLinked > 0) {
                    toast.info('LS 미연동 플랜은 LS 대시보드에서 상품을 먼저 생성한 뒤 "LS → DB"로 연결하세요.');
                  }
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'DB→LS 동기화에 실패했습니다.');
                }
              }}
              disabled={isPushing}
            >
              <Upload className={`mr-2 size-4 ${isPushing ? 'animate-spin' : ''}`} />
              {isPushing ? '동기화 중...' : 'DB → LS'}
            </Button>
            <Button
              render={
                <a
                  href={LS_DASHBOARD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <ExternalLink className="mr-2 size-4" />
              LS에서 플랜 추가
            </Button>
          </div>
        }
      />

      {/* 워크플로우 안내 */}
      <div className="mt-4 rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">플랜 관리 워크플로우</p>
        <ol className="list-decimal list-inside space-y-1">
          <li><strong>LS에서 플랜 추가</strong> — Lemon Squeezy 대시보드에서 상품(Product)과 변형(Variant) 생성</li>
          <li><strong>LS → DB</strong> — LS의 상품을 DB로 동기화하여 플랜 자동 생성 (Variant ID 연결)</li>
          <li><strong>플랜 수정</strong> — 관리자에서 등급(tier), 크레딧, 기능 목록, 설명 등 세부 설정</li>
          <li><strong>DB → LS</strong> — 변경된 가격/이름을 LS에 반영 (연동된 플랜만 업데이트)</li>
        </ol>
      </div>

      <div className="mt-8 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : plans && plans.length > 0 ? (
          plans.map((plan) => (
            <Card key={plan.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-medium">{plan.name}</span>
                      <Badge variant={plan.isActive ? 'default' : 'secondary'}>
                        {TIER_LABELS[plan.tier] ?? plan.tier}
                      </Badge>
                      {!plan.isActive && (
                        <Badge variant="outline">비활성</Badge>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-sm text-muted-foreground">
                        {plan.description}
                      </p>
                    )}
                    {plan.providerVariantId ? (
                      <p className="text-sm text-green-600">
                        프로바이더 연동: Product {plan.providerProductId} / Variant {plan.providerVariantId}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground/70">
                        프로바이더 미연동
                      </p>
                    )}
                    {plan.features && (plan.features as string[]).length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {(plan.features as string[]).map((feature, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {feature}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right space-y-1">
                      <p className="text-lg font-medium">
                        {plan.tier === 'enterprise'
                          ? '별도 협의'
                          : plan.price === 0
                            ? '무료'
                            : `${formatPrice(plan.price, plan.currency)}/${plan.interval === 'year' ? '년' : '월'}${plan.isPerSeat ? '/명' : ''}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        월 {plan.monthlyCredits.toLocaleString()} 크레딧
                      </p>
                    </div>
                    <Dialog
                      open={editingPlanId === plan.id}
                      onOpenChange={(open) => {
                        if (!open) {
                          setEditingPlanId(null);
                          resetForm();
                        }
                      }}
                    >
                      <DialogTrigger
                        render={
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEdit(plan)}
                          />
                        }
                      >
                        <Edit className="size-4" />
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>플랜 수정</DialogTitle>
                        </DialogHeader>
                        <PlanForm
                          formData={formData}
                          onChange={setFormData}
                          onSubmit={handleSubmitEdit}
                          isLoading={updatePlan.isPending}
                          submitLabel="수정"
                        />
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            등록된 플랜이 없습니다. LS 대시보드에서 상품을 생성한 뒤 "LS → DB" 버튼으로 동기화하세요.
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const LS_DASHBOARD_URL = 'https://app.lemonsqueezy.com/products';

const TIER_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'team', label: 'Team' },
  { value: 'enterprise', label: 'Enterprise' },
] as const;

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  team: 'Team',
  enterprise: 'Enterprise',
};

const INTERVAL_OPTIONS = [
  { value: 'month', label: '월간' },
  { value: 'year', label: '연간' },
] as const;

const INITIAL_FORM_DATA: PlanFormData = {
  name: '',
  slug: '',
  description: '',
  tier: 'free',
  monthlyCredits: 0,
  price: 0,
  currency: 'USD',
  interval: 'month',
  providerProductId: '',
  providerVariantId: '',
  features: '',
  isPerSeat: false,
  isActive: true,
  sortOrder: 0,
};

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface PlanFormProps {
  formData: PlanFormData;
  onChange: (data: PlanFormData) => void;
  onSubmit: () => void;
  isLoading: boolean;
  submitLabel: string;
}

function PlanForm({ formData, onChange, onSubmit, isLoading, submitLabel }: PlanFormProps) {
  const update = (key: keyof PlanFormData, value: unknown) => {
    onChange({ ...formData, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="plan-name">이름</Label>
          <Input
            id="plan-name"
            value={formData.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('name', e.target.value)}
            placeholder="Pro Plan"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-slug">슬러그</Label>
          <Input
            id="plan-slug"
            value={formData.slug}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('slug', e.target.value)}
            placeholder="pro"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="plan-description">설명</Label>
        <Textarea
          id="plan-description"
          value={formData.description}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('description', e.target.value)}
          placeholder="플랜 설명"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>등급</Label>
          <Select
            value={formData.tier}
            onValueChange={(v: string | null) => v && update('tier', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>결제 주기</Label>
          <Select
            value={formData.interval}
            onValueChange={(v: string | null) => v && update('interval', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="plan-price">가격 (cents)</Label>
          <Input
            id="plan-price"
            type="number"
            value={formData.price}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              update('price', parseInt(e.target.value) || 0)
            }
            min={0}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-credits">월간 크레딧</Label>
          <Input
            id="plan-credits"
            type="number"
            value={formData.monthlyCredits}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              update('monthlyCredits', parseInt(e.target.value) || 0)
            }
            min={0}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="plan-ls-product">Provider Product ID</Label>
          <Input
            id="plan-ls-product"
            value={formData.providerProductId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              update('providerProductId', e.target.value)
            }
            placeholder="선택사항"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-ls-variant">Provider Variant ID</Label>
          <Input
            id="plan-ls-variant"
            value={formData.providerVariantId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              update('providerVariantId', e.target.value)
            }
            placeholder="선택사항"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="plan-features">기능 목록 (쉼표 구분)</Label>
        <Input
          id="plan-features"
          value={formData.features}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('features', e.target.value)}
          placeholder="무제한 프로젝트, 우선 지원, API 접근"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="plan-sort-order">정렬 순서</Label>
          <Input
            id="plan-sort-order"
            type="number"
            value={formData.sortOrder}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              update('sortOrder', parseInt(e.target.value) || 0)
            }
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch
            checked={formData.isPerSeat}
            onCheckedChange={(checked: boolean) => update('isPerSeat', checked)}
          />
          <Label>인당 과금</Label>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch
            checked={formData.isActive}
            onCheckedChange={(checked: boolean) => update('isActive', checked)}
          />
          <Label>활성화</Label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={onSubmit} disabled={isLoading}>
          {isLoading ? '처리 중...' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatPrice(price: number, currency?: string | null): string {
  const cur = (currency ?? 'USD').toUpperCase();
  if (cur === 'KRW') {
    return `₩${price.toLocaleString()}`;
  }
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface PlanFormData {
  name: string;
  slug: string;
  description: string;
  tier: 'free' | 'pro' | 'team' | 'enterprise';
  monthlyCredits: number;
  price: number;
  currency: string;
  interval: string;
  providerProductId: string;
  providerVariantId: string;
  features: string;
  isPerSeat: boolean;
  isActive: boolean;
  sortOrder: number;
}

type PlanItem = NonNullable<ReturnType<typeof usePlans>['data']>[number];
