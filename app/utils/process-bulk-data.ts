import db from "app/db.server";
import { mapProductStatus, toBigIntId } from "./helpers";
import { triggerCalculationForSelectedProducts } from "./calculate-omnibus-price";
import { Prisma } from "@prisma/client";
import type { AdminApiContextWithoutRest } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients";

// productId (numeric) -> status
const productStatus = new Map<bigint, "active" | "archived">();


export async function processBulkData(url: string, shop: string) {
  console.log("JSONL data parser is running...");

  console.log("JSONL url is :", url);

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

      // console.log("Record is :", record);

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


      // Only run omnibus calc for variants
      let currentDiscountStartedAt: Date | null = null;
      let complianceStatus: string | null = null;
      if (record.id.includes("ProductVariant")) {
        const calc = await triggerCalculationForSelectedProducts(record, "BULK_VARIANTS", shop);
        currentDiscountStartedAt = calc.currentDiscountStartedAt;
        complianceStatus = calc.complianceStatus;
      }

      // const { currentDiscountStartedAt, complianceStatus } = await triggerCalculationForSelectedProducts(record, shop);

      // variant
      if (record.id.includes("ProductVariant")) {
        const variantNumericId = toBigIntId(record.id);           // 46992514646265n
        const parentProductId = toBigIntId(record.__parentId);   // 9008472228089n
        const status = productStatus.get(parentProductId) ?? "archived";

        const variant = await db.variant.upsert({
          where: { shop_variantId: { shop, variantId: variantNumericId } }, // @@unique([shop, variantId])
          create: {
            shop,
            productId: parentProductId,
            variantId: variantNumericId,
            status,
            complianceStatus,
            currentDiscountStartedAt
          },
          update: {
            status,
            complianceStatus,
            currentDiscountStartedAt
          },
        });


        const priceStr = record.price ?? "0";
        const compareAtStr =
          record.compareAtPrice != null ? record.compareAtPrice : record.price ?? "0";

        // Right now we just store raw prices; you can plug discounts later.
        await db.priceHistory.create({
          data: {
            variantId: variant.id,
            date: new Date(),
            market: shop,
            price: new Prisma.Decimal(priceStr),
            compareAtPrice: new Prisma.Decimal(compareAtStr),
            priceWithDiscounts: null,
            compareAtPriceWithDiscounts: null,
          },
        });

        variantCount++;
      }


      console.log("<<<-------------------- Record is : ------------------->>>");
      console.log(record)


      // discounts

      if (record.id.includes("DiscountCodeNode") && record.discount) {
        const d = record.discount as any;
        const typename = d.__typename as string | undefined;

        // Only process these two types
        if (
          typename !== "DiscountCodeBasic" &&
          typename !== "DiscountAutomaticBasic"
        ) {
          continue;
        }

        const discountNumericId = toBigIntId(record.id);

        // amount + type
        let amount = 0;
        let type = typename ?? "UNKNOWN";

        const value = d.customerGets?.value;
        if (value) {
          if (typeof value.percentage === "number") {
            amount = value.percentage; // 10 => 10%
            type = "percentage";
          } else if (value.amount?.amount != null) {
            amount = Number(value.amount.amount); // 20.0 fixed amount
            type = "fixed_amount";
          }
        }

        // appliesTo: if allItems, treat as PRODUCT for now.
        let appliesTo: "PRODUCT" | "COLLECTION" = "PRODUCT";
        const items = d.customerGets?.items;
        if (items?.collections) {
          appliesTo = "COLLECTION";
        }

        // Keep existing productIds / collectionIds if row already exists
        const existing = await db.discount.findUnique({
          where: { discountId: discountNumericId },
        });

        await db.discount.upsert({
          where: {
            discountId: discountNumericId,
          },
          create: {
            shop,
            discountId: discountNumericId,
            amount,
            type,
            appliesTo,
            productIds: [],
            collectionIds: [],
          },
          update: {
            shop,
            amount,
            type,
            appliesTo,
            // preserve arrays
            productIds: existing?.productIds ?? [],
            collectionIds: existing?.collectionIds ?? [],
          },
        });
      }

      // DISCOUNT ↔ PRODUCT join rows
      if (
        record.id.includes("Product") &&
        record.__parentId?.includes("DiscountCodeNode") &&
        !record.handle
      ) {
        const discountNumericId = toBigIntId(record.__parentId);

        const existing = await db.discount.findUnique({
          where: { discountId: discountNumericId },
        });

        // If for some reason the base discount row wasn't seen yet, create a minimal one
        if (!existing) {
          await db.discount.create({
            data: {
              shop,
              discountId: discountNumericId,
              amount: 0,
              type: "UNKNOWN",
              appliesTo: "PRODUCT",
              productIds: [record.id],
              collectionIds: [],
            },
          });
        } else {
          const productIds = existing.productIds.includes(record.id)
            ? existing.productIds
            : [...existing.productIds, record.id];

          await db.discount.update({
            where: { discountId: discountNumericId },
            data: {
              appliesTo: "PRODUCT",
              productIds,
            },
          });
        }
      }

      // DISCOUNT ↔ COLLECTION join rows
      if (
        record.id.includes("Collection") &&
        record.__parentId?.includes("DiscountCodeNode") &&
        !record.handle
      ) {
        const discountNumericId = toBigIntId(record.__parentId);

        const existing = await db.discount.findUnique({
          where: { discountId: discountNumericId },
        });

        if (!existing) {
          await db.discount.create({
            data: {
              shop,
              discountId: discountNumericId,
              amount: 0,
              type: "UNKNOWN",
              appliesTo: "COLLECTION",
              productIds: [],
              collectionIds: [record.id],
            },
          });
        } else {
          const collectionIds = existing.collectionIds.includes(record.id)
            ? existing.collectionIds
            : [...existing.collectionIds, record.id];

          await db.discount.update({
            where: { discountId: discountNumericId },
            data: {
              appliesTo: "COLLECTION",
              collectionIds,
            },
          });
        }
      }

      // PRODUCT ↔ COLLECTION join rows
      if (
        record.id.includes("Product") &&
        record.__parentId?.includes("Collection") &&
        !record.handle // join rows have no handle/status
      ) {
        const productNumericId = toBigIntId(record.id); // product
        const collectionNumericId = toBigIntId(record.__parentId); // collection

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


export async function fetchCollection(admin: AdminApiContextWithoutRest, shop: string) {
  const COLLECTIONS_QUERY = `
  query CollectionsForOmnibus($cursor: String) {
    collections(first: 250, after: $cursor) {
      edges {
        cursor
        node {
          id
          handle
          products(first: 250) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(COLLECTIONS_QUERY, {
      variables: { cursor },
    });

    const json = (await response.json()) as any;

    const edges = json.data.collections.edges as any[];
    const pageInfo = json.data.collections.pageInfo;

    for (const edge of edges) {
      const node = edge.node;
      const collectionIdGid = node.id as string;
      const collectionNumericId = toBigIntId(collectionIdGid);

      // upsert collection itself
      await db.collection.upsert({
        where: { collectionId: collectionNumericId },
        create: {
          collectionId: collectionNumericId,
          handle: node.handle,
        },
        update: {
          handle: node.handle,
        },
      });

      // connect products to this collection
      for (const prodEdge of node.products.edges as any[]) {
        const productGid = prodEdge.node.id as string;
        const productNumericId = toBigIntId(productGid);

        // if the product exists, connect it to the collection
        await db.product.update({
          where: { productId: productNumericId },
          data: {
            collections: {
              connect: { collectionId: collectionNumericId },
            },
          },
        });
      }

      cursor = edge.cursor;
    }

    hasNextPage = pageInfo.hasNextPage;
  }
}
