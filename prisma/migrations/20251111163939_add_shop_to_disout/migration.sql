/*
  Warnings:

  - Added the required column `shop` to the `Discount` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Discount" ADD COLUMN     "shop" TEXT NOT NULL;
