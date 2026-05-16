// Storage-quota threshold logic per ADR-0013.
//
// Pure helper extracted so we can test the banner-classification without
// stubbing the `navigator.storage` API. The thresholds (80 %, 95 %) are
// the ADR-0013 values; the 5 % tolerance the ADR mentions is left to
// follow-up tickets — for v1 we use exact thresholds.

export type QuotaLevel = "ok" | "warning" | "critical";

export interface StorageQuota {
  usage: number;
  quota: number;
  ratio: number;
  level: QuotaLevel;
}

export function classifyQuota(usage: number, quota: number): StorageQuota {
  if (quota <= 0) {
    return { usage, quota, ratio: 0, level: "ok" };
  }
  const ratio = usage / quota;
  const level: QuotaLevel = ratio >= 0.95 ? "critical" : ratio >= 0.8 ? "warning" : "ok";
  return { usage, quota, ratio, level };
}
