/** 의존성 해결 결과 */
export interface ResolvedFeatures {
  /** 사용자가 직접 선택한 features */
  selected: string[];
  /** 의존성으로 자동 포함된 features */
  autoIncluded: string[];
  /** 최종 확정된 전체 features (selected + autoIncluded, 토폴로지 순서) */
  resolved: string[];
  /** optional dependencies 중 포함 가능한 목록 */
  availableOptional: string[];
}

/** 의존성 해결 에러 */
export interface ResolutionError {
  type: "circular_dependency" | "missing_dependency";
  message: string;
  /** 순환 의존성인 경우 순환 경로 */
  cycle?: string[];
  /** 누락 의존성인 경우 누락된 feature */
  missing?: string;
  /** 누락 의존성을 요구하는 feature */
  requiredBy?: string;
}
