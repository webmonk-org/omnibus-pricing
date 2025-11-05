import type { Session } from "inspector";

// Enums
export enum PlanId {
  BASIC = "BASIC",
  PRO = "PRO",
  PLUS = "PLUS",
}

export enum SubscriptionStatus {
  ACTIVE = "ACTIVE",
  CANCELLED = "CANCELLED",
}

// Shop type
export type Shop = {
  id: string;
  shop?: string | null; // optional & unique
  myshopifyDomain: string;
  shopId: string;
  primaryDomain: string;
  shopName: string;
  planName: string;
  isShopifyPlus: boolean;
  isDevStore: boolean;
  ownerEmail: string;
  ownerName: string;
  currencyCode: string;
  ianaTimezone: string;
  billingCompany?: string | null;
  billingCity?: string | null;
  billingCountry?: string | null;
  billingCountryCode?: string | null;
  billingPhone?: string | null;
  creationDate?: Date | null;
  createdAt: Date;
  updatedAt?: Date | null;
  Session?: Session | null; // assuming Session is defined elsewhere
};

// Subscription type
export type Subscription = {
  id: string;
  shop?: string | null;
  myshopifyDomain: string;
  createdAt: Date;
  updatedAt: Date;
  planId: PlanId;
  status: SubscriptionStatus;
  currency: string;
  amount: number;
  interval: string;
  isTest: boolean;
  currentPeriodEnd?: Date | null;
  canceledAt?: Date | null;
  trialDays?: number | null;
  variantCount: number;
  marketCount: number;
  billingMetadata?: Record<string, any> | null; // JSON type
  Session?: Session | null;
};
