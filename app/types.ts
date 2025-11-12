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

export type VariantStatus = 'active' | 'archived';
export type ComplianceStatus = 'compliant' | 'non_compliant' | 'not_on_sale' | 'not_enough_data';

export interface VariantRecord {
  id: string;
  shop: string;
  productId: number;
  variantId: number;
  status: VariantStatus;

  complianceStatus?: ComplianceStatus | null;
  currentDiscountStartedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export type ComplianceKey =
  | "compliant"
  | "non_compliant"
  | "not_on_sale"
  | "not_enough_data";


export interface ProductRecord {
  productId: number,
  handle: string,
}

export interface DiscountContext {
  record: any;
  shop: string;
  variantId: BigInt;
  productId: BigInt;
  status: "active" | "archived";
};


export type NormalizedTargets = {
  productIds: string[];
  collectionIds: string[];
  appliesTo: "PRODUCT" | "COLLECTION";
  type: "percentage" | "fixed_amount";
  amount: number;
};

export type DiscountItem = {
  id: string;
  title: string;
  subtitle?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  type: string;
};
