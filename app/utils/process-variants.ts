// export async function computeVariantDiscountFields({
//   record,
//   shop,
//   variantId,
// }: DiscountContext) {
//   const now = new Date();
//
//   const price =
//     record.price != null ? parseFloat(record.price) : null;
//   const compareAtPrice =
//     record.compareAtPrice != null ? parseFloat(record.compareAtPrice) : null;
//
//   const isDiscounted =
//     price !== null &&
//     compareAtPrice !== null &&
//     compareAtPrice > price;
//
//   const existing = await db.variant.findUnique({
//     where: {
//       shop_variantId: { shop, variantId },
//     },
//   });
//
//   let currentDiscountStartedAt: Date | null =
//     existing?.currentDiscountStartedAt ?? null;
//   let complianceStatus: string | null = existing?.complianceStatus ?? null;
//
//   if (isDiscounted) {
//     // Newly discounted so start period now
//     if (!existing?.currentDiscountStartedAt) {
//       currentDiscountStartedAt = now;
//     }
//     // Until we’ve done Omnibus checks
//     if (!complianceStatus || complianceStatus === "not_on_sale") {
//       complianceStatus = "not_enough_data";
//     }
//   } else {
//     // No discount so not on sale
//     currentDiscountStartedAt = null;
//     complianceStatus = "not_on_sale";
//   }
//
//   return {
//     lastProcessedAt: now, // not stored yet, but useful if you add a field later
//     currentDiscountStartedAt,
//     complianceStatus,
//   };
// }



import db from "app/db.server";
import { mapProductStatus, toBigIntId } from "./helpers";


// productId (numeric) -> status
const productStatus = new Map<bigint, "active" | "archived">();


export async function processVariants(url: string, shop: string) {
  console.log("JSONL data parser is running...");

  productStatus.clear();

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    console.error("Failed to download JSONL", res.status);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let lineCount = 0;
  let variantCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      lineCount++;

      let record: any;
      try {
        record = JSON.parse(line);
      } catch (e) {
        console.error("Failed to parse JSONL line:", line);
        continue;
      }

      console.log("Record is :", record);

      // product
      if (record.id.includes("Product") && record.handle && record.status) {
        const productNumericId = toBigIntId(record.id); // extract 9008472228089n

        await db.product.upsert({
          where: { productId: productNumericId },
          create: {
            productId: productNumericId,
            handle: record.handle,
          },
          update: {
            handle: record.handle,
            // keep handle in sync
          },
        });

        productStatus.set(productNumericId, mapProductStatus(record.status));
      }

      // variant
      if (record.id.includes("ProductVariant")) {
        const variantNumericId = toBigIntId(record.id);           // 46992514646265n
        const parentProductId = toBigIntId(record.__parentId);   // 9008472228089n
        const status = productStatus.get(parentProductId) ?? "archived";

        await db.variant.upsert({
          where: { shop_variantId: { shop, variantId: variantNumericId } }, // @@unique([shop, variantId])
          create: {
            shop,
            productId: parentProductId,
            variantId: variantNumericId,
            status,
            // NOTE: omnibus fields left null for now
          },
          update: {
            status,
          },
        });

        // NOTE: build PriceHistory later, here is where you see price/compareAtPrice
      }

      // collection
      if (record.id.includes("Collection") && record.handle) {
        const collectionNumericId = toBigIntId(record.id); // 456786379001n

        await db.collection.upsert({
          where: { collectionId: collectionNumericId },
          create: {
            collectionId: collectionNumericId,
            handle: record.handle,
          },
          update: {
            handle: record.handle,
          },
        });
      }

      if (
        record.id.includes("Product") &&
        record.__parentId?.includes("Collection") &&
        !record.handle // join rows have no handle/status
      ) {
        const productNumericId = toBigIntId(record.id);        // product
        const collectionNumericId = toBigIntId(record.__parentId); // collection

        // Option A: update the product, connect a collection
        await db.product.update({
          where: { productId: productNumericId },
          data: {
            collections: {
              connect: { collectionId: collectionNumericId },
            },
          },
        });
      }

    }
  }

  console.log(
    `Parsed ${lineCount} lines and saved ${variantCount} variants for ${shop}`,
  );
}

