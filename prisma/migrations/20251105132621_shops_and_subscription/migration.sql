/*
  Warnings:

  - A unique constraint covering the columns `[shop]` on the table `Session` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PlanId" AS ENUM ('BASIC', 'PRO', 'PLUS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "calculationInProgress" BOOLEAN DEFAULT false,
ADD COLUMN     "settings" JSONB,
ADD COLUMN     "uninstallDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "myshopifyDomain" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "primaryDomain" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "isShopifyPlus" BOOLEAN NOT NULL,
    "isDevStore" BOOLEAN NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "ianaTimezone" TEXT NOT NULL,
    "billingCompany" TEXT,
    "billingCity" TEXT,
    "billingCountry" TEXT,
    "billingCountryCode" TEXT,
    "billingPhone" TEXT,
    "creationDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "myshopifyDomain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "planId" "PlanId" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "interval" TEXT NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "currentPeriodEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "trialDays" INTEGER,
    "variantCount" INTEGER NOT NULL DEFAULT 0,
    "marketCount" INTEGER NOT NULL DEFAULT 0,
    "billingMetadata" JSONB,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastProcessedAt" TIMESTAMP(3),
    "complianceStatus" TEXT,
    "currentDiscountStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shop_key" ON "Shop"("shop");

-- CreateIndex
CREATE INDEX "Subscription_shop_idx" ON "Subscription"("shop");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- CreateIndex
CREATE INDEX "Variant_shop_status_idx" ON "Variant"("shop", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_shop_variantId_key" ON "Variant"("shop", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_shop_key" ON "Session"("shop");

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE SET NULL ON UPDATE CASCADE;
