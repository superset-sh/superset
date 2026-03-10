import { useState } from 'react';
import { PageHeader } from '@superbuilder/feature-ui/components/page-header';
import { Card, CardContent } from '@superbuilder/feature-ui/shadcn/card';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import { Input } from '@superbuilder/feature-ui/shadcn/input';
import { Label } from '@superbuilder/feature-ui/shadcn/label';
import { Switch } from '@superbuilder/feature-ui/shadcn/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@superbuilder/feature-ui/shadcn/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@superbuilder/feature-ui/shadcn/table';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';
import { Plus, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { useModelPricing, useUpsertModelPricing } from '../hooks/use-model-pricing';

export function ModelPricingPage() {
  const { data: pricingList, isLoading } = useModelPricing();
  const upsertPricing = useUpsertModelPricing();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);

  // 폼 상태
  const [formData, setFormData] = useState<PricingFormData>(INITIAL_FORM_DATA);

  const resetForm = () => {
    setFormData(INITIAL_FORM_DATA);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (pricing: PricingItem) => {
    setFormData({
      modelId: pricing.modelId,
      provider: pricing.provider,
      displayName: pricing.displayName,
      inputCreditsPerKToken: pricing.inputCreditsPerKToken,
      outputCreditsPerKToken: pricing.outputCreditsPerKToken,
      isActive: pricing.isActive,
    });
    setEditingModelId(pricing.modelId);
  };

  const handleSubmit = (closeDialog: () => void) => {
    if (!formData.modelId.trim() || !formData.provider.trim() || !formData.displayName.trim()) {
      toast.error('모델 ID, 제공자, 표시 이름을 입력해주세요.');
      return;
    }

    upsertPricing.mutate(
      {
        modelId: formData.modelId.trim(),
        provider: formData.provider.trim(),
        displayName: formData.displayName.trim(),
        inputCreditsPerKToken: formData.inputCreditsPerKToken,
        outputCreditsPerKToken: formData.outputCreditsPerKToken,
        isActive: formData.isActive,
      },
      {
        onSuccess: () => {
          toast.success('모델 가격이 저장되었습니다.');
          closeDialog();
          resetForm();
        },
        onError: (error) => {
          toast.error(error.message || '모델 가격 저장에 실패했습니다.');
        },
      },
    );
  };

  return (
    <div className="container mx-auto py-8">
      <PageHeader
        title="모델 가격 설정"
        description="AI 모델별 크레딧 단가를 설정합니다"
        actions={
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger render={<Button onClick={handleOpenCreate} />}>
              <Plus className="mr-2 size-4" />
              모델 추가
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>새 모델 가격 추가</DialogTitle>
              </DialogHeader>
              <PricingForm
                formData={formData}
                onChange={setFormData}
                onSubmit={() => handleSubmit(() => setIsCreateOpen(false))}
                isLoading={upsertPricing.isPending}
                submitLabel="저장"
                isNew
              />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mt-8">
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : pricingList && pricingList.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>모델</TableHead>
                    <TableHead>제공자</TableHead>
                    <TableHead className="text-right">입력 (크레딧/1K토큰)</TableHead>
                    <TableHead className="text-right">출력 (크레딧/1K토큰)</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pricingList.map((pricing) => (
                    <TableRow key={pricing.modelId}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{pricing.displayName}</p>
                          <p className="text-sm text-muted-foreground">{pricing.modelId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{pricing.provider}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {pricing.inputCreditsPerKToken.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {pricing.outputCreditsPerKToken.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={pricing.isActive ? 'default' : 'secondary'}>
                          {pricing.isActive ? '활성' : '비활성'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog
                          open={editingModelId === pricing.modelId}
                          onOpenChange={(open) => {
                            if (!open) {
                              setEditingModelId(null);
                              resetForm();
                            }
                          }}
                        >
                          <DialogTrigger
                            render={
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenEdit(pricing)}
                              />
                            }
                          >
                            <Edit className="size-4" />
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>모델 가격 수정</DialogTitle>
                            </DialogHeader>
                            <PricingForm
                              formData={formData}
                              onChange={setFormData}
                              onSubmit={() =>
                                handleSubmit(() => {
                                  setEditingModelId(null);
                                  resetForm();
                                })
                              }
                              isLoading={upsertPricing.isPending}
                              submitLabel="수정"
                              isNew={false}
                            />
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            등록된 모델 가격이 없습니다. 첫 모델을 추가해보세요.
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const INITIAL_FORM_DATA: PricingFormData = {
  modelId: '',
  provider: '',
  displayName: '',
  inputCreditsPerKToken: 0,
  outputCreditsPerKToken: 0,
  isActive: true,
};

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface PricingFormProps {
  formData: PricingFormData;
  onChange: (data: PricingFormData) => void;
  onSubmit: () => void;
  isLoading: boolean;
  submitLabel: string;
  isNew: boolean;
}

function PricingForm({
  formData,
  onChange,
  onSubmit,
  isLoading,
  submitLabel,
  isNew,
}: PricingFormProps) {
  const update = (key: keyof PricingFormData, value: unknown) => {
    onChange({ ...formData, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="pricing-model-id">모델 ID</Label>
          <Input
            id="pricing-model-id"
            value={formData.modelId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              update('modelId', e.target.value)
            }
            placeholder="gpt-4o"
            disabled={!isNew}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pricing-provider">제공자</Label>
          <Input
            id="pricing-provider"
            value={formData.provider}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              update('provider', e.target.value)
            }
            placeholder="openai"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="pricing-display-name">표시 이름</Label>
        <Input
          id="pricing-display-name"
          value={formData.displayName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            update('displayName', e.target.value)
          }
          placeholder="GPT-4o"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="pricing-input">입력 크레딧 / 1K 토큰</Label>
          <Input
            id="pricing-input"
            type="number"
            value={formData.inputCreditsPerKToken}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              update('inputCreditsPerKToken', parseInt(e.target.value) || 0)
            }
            min={0}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pricing-output">출력 크레딧 / 1K 토큰</Label>
          <Input
            id="pricing-output"
            type="number"
            value={formData.outputCreditsPerKToken}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              update('outputCreditsPerKToken', parseInt(e.target.value) || 0)
            }
            min={0}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={formData.isActive}
          onCheckedChange={(checked: boolean) => update('isActive', checked)}
        />
        <Label>활성화</Label>
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
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface PricingFormData {
  modelId: string;
  provider: string;
  displayName: string;
  inputCreditsPerKToken: number;
  outputCreditsPerKToken: number;
  isActive: boolean;
}

type PricingItem = NonNullable<ReturnType<typeof useModelPricing>['data']>[number];
