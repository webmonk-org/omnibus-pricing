/*
  Warnings:

  - A unique constraint covering the columns `[discountId]` on the table `Discount` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `discountId` to the `Discount` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Discount" ADD COLUMN     "discountId" BIGINT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Discount_discountId_key" ON "Discount"("discountId");
