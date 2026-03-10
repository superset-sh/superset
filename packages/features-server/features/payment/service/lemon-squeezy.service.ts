import { Injectable, Inject, BadGatewayException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { paymentConfig } from '../config/payment.config';
import type {
  LemonSqueezyListResponse,
  LemonSqueezyResponse,
  LemonSqueezyProduct,
  LemonSqueezyVariant,
  LemonSqueezySubscription,
  LemonSqueezyOrder,
  LemonSqueezyLicenseKey,
  LemonSqueezyPriceModel,
  LemonSqueezyPriceModelAttributes,
  CreateCheckoutData,
  CheckoutResponse,
} from '../types/lemon-squeezy.types';

@Injectable()
export class LemonSqueezyService {
  private readonly apiUrl = 'https://api.lemonsqueezy.com/v1';
  private readonly apiKey: string;

  constructor(
    @Inject(paymentConfig.KEY)
    private config: ConfigType<typeof paymentConfig>,
  ) {
    this.apiKey = this.config.lemonSqueezyApiKey;
  }

  /**
   * API 요청 헬퍼
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new BadGatewayException(
        `Lemon Squeezy API 오류: ${response.status} - ${JSON.stringify(error)}`,
      );
    }

    return response.json();
  }

  // ========== Products ==========

  async getProducts(): Promise<LemonSqueezyListResponse<LemonSqueezyProduct>> {
    return this.request(`/products`);
  }

  async getProduct(id: string): Promise<LemonSqueezyResponse<LemonSqueezyProduct>> {
    return this.request(`/products/${id}`);
  }

  // ========== Variants ==========

  async getVariants(
    productId?: string,
  ): Promise<LemonSqueezyListResponse<LemonSqueezyVariant>> {
    const query = productId ? `?filter[product_id]=${productId}` : '';
    return this.request(`/variants${query}`);
  }

  async getVariant(id: string): Promise<LemonSqueezyResponse<LemonSqueezyVariant>> {
    return this.request(`/variants/${id}`);
  }

  /**
   * Variant의 price-model 조회 (include=price-model)
   * volume/graduated 등 실제 가격 정보를 가져옴
   */
  async getVariantPriceModel(variantId: string): Promise<LemonSqueezyPriceModel | null> {
    const res = await this.request<{
      data: { id: string; type: string; attributes: LemonSqueezyVariant };
      included?: Array<{ type: string; id: string; attributes: LemonSqueezyPriceModelAttributes }>;
    }>(`/variants/${variantId}?include=price-model`);

    const priceModelData = res.included?.find((i) => i.type === 'prices');
    if (!priceModelData) return null;

    return { id: priceModelData.id, attributes: priceModelData.attributes };
  }

  // ========== Product / Variant 생성·수정 (DB→LS 동기화용) ==========

  /**
   * LS에 새 Product 생성 (기본 variant가 자동 생성됨)
   */
  async createProduct(storeId: string, data: { name: string; description?: string }) {
    return this.request<LemonSqueezyResponse<LemonSqueezyProduct>>('/products', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'products',
          attributes: { name: data.name, description: data.description ?? '', slug: '' },
          relationships: {
            store: { data: { type: 'stores', id: storeId } },
          },
        },
      }),
    });
  }

  /**
   * LS Variant 가격/구독 설정 업데이트
   */
  async updateVariant(
    variantId: string,
    data: { name?: string; price?: number; is_subscription?: boolean; interval?: string; interval_count?: number },
  ) {
    return this.request<LemonSqueezyResponse<LemonSqueezyVariant>>(`/variants/${variantId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: { type: 'variants', id: variantId, attributes: data },
      }),
    });
  }

  /**
   * Store ID 반환 (config에서)
   */
  getStoreId(): string {
    return this.config.lemonSqueezyStoreId;
  }

  /**
   * Store 통화 조회
   */
  async getStoreCurrency(): Promise<string> {
    const storeId = this.config.lemonSqueezyStoreId;
    const res = await this.request<{ data: { attributes: { currency: string } } }>(`/stores/${storeId}`);
    return res.data.attributes.currency;
  }

  // ========== Checkouts ==========

  async createCheckout(data: CreateCheckoutData): Promise<CheckoutResponse> {
    // LS API는 store/variant를 relationships로 요구함
    const { store_id, variant_id, ...attributes } = data;

    return this.request('/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes,
          relationships: {
            store: { data: { type: 'stores', id: String(store_id) } },
            variant: { data: { type: 'variants', id: String(variant_id) } },
          },
        },
      }),
    });
  }

  // ========== Subscriptions ==========

  async getSubscription(
    id: string,
  ): Promise<LemonSqueezyResponse<LemonSqueezySubscription>> {
    return this.request(`/subscriptions/${id}`);
  }

  async updateSubscription(
    id: string,
    data: Partial<LemonSqueezySubscription>,
  ): Promise<LemonSqueezyResponse<LemonSqueezySubscription>> {
    return this.request(`/subscriptions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { type: 'subscriptions', id, attributes: data } }),
    });
  }

  async cancelSubscription(
    id: string,
  ): Promise<LemonSqueezyResponse<LemonSqueezySubscription>> {
    return this.request(`/subscriptions/${id}`, {
      method: 'DELETE',
    });
  }

  // ========== Orders ==========

  async getOrder(id: string): Promise<LemonSqueezyResponse<LemonSqueezyOrder>> {
    return this.request(`/orders/${id}`);
  }

  // ========== License Keys ==========

  async getLicenseKey(id: string): Promise<LemonSqueezyResponse<LemonSqueezyLicenseKey>> {
    return this.request(`/license-keys/${id}`);
  }

  async validateLicenseKey(
    key: string,
  ): Promise<LemonSqueezyResponse<LemonSqueezyLicenseKey>> {
    return this.request('/license-keys/validate', {
      method: 'POST',
      body: JSON.stringify({ license_key: key }),
    });
  }

  async activateLicenseKey(
    key: string,
    instanceName: string,
  ): Promise<LemonSqueezyResponse<LemonSqueezyLicenseKey>> {
    return this.request('/license-keys/activate', {
      method: 'POST',
      body: JSON.stringify({ license_key: key, instance_name: instanceName }),
    });
  }

  async deactivateLicenseKey(
    key: string,
    instanceId: string,
  ): Promise<LemonSqueezyResponse<LemonSqueezyLicenseKey>> {
    return this.request('/license-keys/deactivate', {
      method: 'POST',
      body: JSON.stringify({ license_key: key, instance_id: instanceId }),
    });
  }

  // ========== Refunds ==========

  /**
   * 주문 환불 (POST /v1/orders/{orderId}/refund)
   * Lemon Squeezy API를 통한 전액 환불
   */
  async refundOrder(orderId: string): Promise<LemonSqueezyResponse<LemonSqueezyOrder>> {
    return this.request(`/orders/${orderId}/refund`, {
      method: 'POST',
    });
  }
}
