/*
  Warnings:

  - Added the required column `compareAtPrice` to the `PriceHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `date` to the `PriceHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `market` to the `PriceHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price` to the `PriceHistory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PriceHistory" ADD COLUMN     "compareAtPrice" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "compareAtPriceWithDiscounts" DECIMAL(10,2),
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "market" TEXT NOT NULL,
ADD COLUMN     "price" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "priceWithDiscounts" DECIMAL(10,2);
