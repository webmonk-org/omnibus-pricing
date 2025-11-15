/*
  Warnings:

  - You are about to drop the column `status` on the `Variant` table. All the data in the column will be lost.
  - Added the required column `status` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Variant_shop_status_idx";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "status" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Variant" DROP COLUMN "status";

-- CreateIndex
CREATE INDEX "Variant_shop_idx" ON "Variant"("shop");
