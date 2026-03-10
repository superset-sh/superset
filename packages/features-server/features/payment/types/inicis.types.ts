import type { NormalizedWebhookEventType } from "./normalized.types";

/**
 * KG이니시스 모바일 표준결제 관련 타입 정의
 */

// ========== 결제 요청 (Form POST) ==========

/**
 * 모바일 표준결제 요청 파라미터 (Form POST → INICIS 결제창)
 * @see https://manual.inicis.com/pay/stdpay_m.html
 */
export interface InicisMobilePaymentRequest {
  /** 상점아이디 */
  P_INI_PAYMENT: "CARD" | "BANK" | "VBANK" | "MOBILE" | "HPP";
  /** 상점 MID */
  P_MID: string;
  /** 주문번호 */
  P_OID: string;
  /** 결제금액 (문자열) */
  P_AMT: string;
  /** 상품명 */
  P_GOODS: string;
  /** 구매자명 */
  P_UNAME?: string;
  /** 결제 후 리턴 URL */
  P_NEXT_URL: string;
  /** 결제 후 실패 시 리턴 URL */
  P_NOTI_URL?: string;
  /** 결제 수단 */
  P_RESERVED?: string;
  /** 가격위변조 방지 해시 */
  P_CHKFAKE?: string;
  /** 타임스탬프 */
  P_TIMESTAMP?: string;
  /** 구매자 이메일 */
  P_EMAIL?: string;
  /** 에스크로 여부 */
  P_USE_ESCROW?: "Y" | "N";
  /** 사용자 정의 데이터 */
  P_NOTI?: string;
}

// ========== 인증 결과 (P_NEXT_URL 콜백) ==========

/**
 * 모바일 인증 결과 파라미터 (INICIS → 가맹점 P_NEXT_URL로 리다이렉트)
 */
export interface InicisAuthResult {
  /** 인증 결과 코드 (00: 성공) */
  P_STATUS: string;
  /** 인증 결과 메시지 */
  P_RMESG1: string;
  /** 거래번호 (TID) */
  P_TID: string;
  /** 주문번호 */
  P_OID: string;
  /** 결제금액 */
  P_AMT: string;
  /** 결제 수단 */
  P_TYPE?: string;
  /** 승인 요청 URL */
  P_REQ_URL: string;
  /** IDC 센터 코드 (fc, ks, stg) — centerCd=Y 설정 시 수신 */
  idc_name?: string;
  /** 사용자 정의 데이터 */
  P_NOTI?: string;
}

// ========== 승인 결과 (P_REQ_URL 응답) ==========

/**
 * 승인 결과 응답 (P_REQ_URL 호출 결과)
 */
export interface InicisApprovalResult {
  /** 결과 코드 (00: 성공) */
  P_STATUS: string;
  /** 결과 메시지 */
  P_RMESG1: string;
  /** 거래번호 (TID) */
  P_TID: string;
  /** 결제 수단 */
  P_TYPE: string;
  /** 주문번호 */
  P_OID: string;
  /** 결제 금액 */
  P_AMT: string;
  /** 승인일시 (YYYYMMDDHHmmss) */
  P_AUTH_DT?: string;
  /** 승인번호 */
  P_AUTH_NO?: string;
  /** 구매자명 */
  P_UNAME?: string;
  /** 가맹점명 */
  P_MNAME?: string;
  /** 카드번호 (마스킹) */
  P_CARD_NUM?: string;
  /** 카드사 코드 */
  P_FN_CD1?: string;
  /** 카드사명 / 은행명 */
  P_FN_NM?: string;
  /** 무이자 여부 ("1": 가맹점 부담 무이자) */
  P_CARD_INTEREST?: string;
  /** 할부 개월 */
  P_RMESG2?: string;
  /** 개인/법인 구분 ("0": 개인, "1": 법인, "9": 미확인) */
  CARD_CorpFlag?: string;
  /** 카드 유형 ("0": 신용, "1": 체크, "2": 기프트) */
  P_CARD_CHECKFLAG?: string;
  /** 부분취소 가능 여부 ("1": 가능, "0": 불가) */
  P_CARD_PRTC_CODE?: string;
  /** 사용자 정의 데이터 */
  P_NOTI?: string;
}

// ========== 취소 API V2 ==========

/**
 * INICIS 취소 API V2 (JSON) 요청
 * @see https://iniapi.inicis.com/v2/pg/refund
 */
export interface InicisCancelRequest {
  /** 취소 유형: 전액 or 부분 */
  type: "Refund" | "PartialRefund";
  /** 결제수단 */
  paymethod: string;
  /** 타임스탬프 (YYYYMMDDHHmmss) */
  timestamp: string;
  /** 클라이언트 IP */
  clientIp: string;
  /** 상점 MID */
  mid: string;
  /** 거래번호 */
  tid: string;
  /** 메시지 (취소 사유) */
  msg: string;
  /** 해시값: SHA512(INIAPIKey + type + paymethod + timestamp + clientIp + mid + tid) */
  hashData: string;
  /** 부분취소 금액 (부분취소 시 필수) */
  price?: number;
  /** 부분취소 과세 금액 */
  confirmPrice?: number;
  /** 부분취소 비과세 금액 */
  taxFreePrice?: number;
}

/**
 * INICIS 취소 API V2 응답
 */
export interface InicisCancelResponse {
  /** 결과 코드 (00: 성공) */
  resultCode: string;
  /** 결과 메시지 */
  resultMsg: string;
  /** 취소일시 */
  cancelDate?: string;
  /** 취소시각 */
  cancelTime?: string;
  /** 거래번호 */
  tid?: string;
  /** 원거래 PG 거래번호 */
  pgTid?: string;
}

// ========== 웹훅 ==========

/**
 * INICIS 가상계좌 입금통보 (NOTI) 파라미터
 */
export interface InicisVbankNotiPayload {
  /** 거래번호 */
  no_tid: string;
  /** 주문번호 */
  no_oid: string;
  /** 결제금액 */
  amt_input: string;
  /** 결제 수단 */
  type_msg: "deposit" | "cancel";
  /** 결과 코드 */
  result_code: string;
  /** 결과 메시지 */
  result_msg: string;
}

// ========== 이벤트 매핑 ==========

/**
 * INICIS → 정규화 이벤트 매핑
 * INICIS는 SaaS 결제 플랫폼이 아니므로 제한된 이벤트만 지원
 */
export const INICIS_EVENT_MAP: Record<string, NormalizedWebhookEventType> = {
  payment_completed: "order_created",
  payment_cancelled: "order_refunded",
  vbank_deposit: "order_created",
};

// ========== 결제 수단 상수 ==========

export const INICIS_PAY_METHOD = {
  CARD: "CARD",
  BANK: "BANK",
  VBANK: "VBANK",
  MOBILE: "MOBILE",
  HPP: "HPP",
} as const;

export type InicisPayMethod = (typeof INICIS_PAY_METHOD)[keyof typeof INICIS_PAY_METHOD];

// ========== 환경 설정 ==========

/**
 * INICIS 엔드포인트 URL
 * 참고: 모바일 결제창 URL은 테스트/운영 동일 — MID(INIpayTest vs 실상점 MID)로 환경 구분
 */
export const INICIS_ENDPOINTS = {
  /** 모바일 결제창 URL (테스트/운영 동일, MID로 환경 구분) */
  MOBILE_PAYMENT: "https://mobile.inicis.com/smart/payment/",
  /** 취소 API V2 (Production) */
  CANCEL_API: "https://iniapi.inicis.com/v2/pg/refund",
  /** 취소 API V2 (Test) */
  CANCEL_API_TEST: "https://stginiapi.inicis.com/v2/pg/refund",
} as const;

/**
 * INICIS 허용 도메인 목록 (SSRF 방지)
 * P_REQ_URL 등 INICIS 서버에서 전달받은 URL의 도메인을 검증할 때 사용
 */
export const INICIS_ALLOWED_DOMAINS = ["inicis.com"] as const;

/** 테스트용 MID */
export const INICIS_TEST_MID = "INIpayTest";
