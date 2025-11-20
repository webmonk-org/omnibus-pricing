import db from "app/db.server";
import { toBigIntId } from "./helpers";
import { Prisma } from "@prisma/client";
import type { AdminApiContextWithoutRest } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients";
import { pushOmnibusForProduct } from "./calculate-omnibus-price";

// Track discounts and their targets
const discountMap = new Map<bigint, {
  discountId: bigint;
  type: "PERCENTAGE" | "AMOUNT";
  amount: number;
  appliesTo: "PRODUCT" | "COLLECTION";
  productIds: Set<string>;
  collectionIds: Set<string>;
}>();

// Map of "parent gid" => discountId (numeric)
// We don't know whether __parentId will be DiscountNode id or DiscountCodeBasic id,
// so we store both as possible parents.
const discountParentLookup = new Map<string, bigint>();


export async function processBulkData(
  url: string,
  shop: string,
  admin: AdminApiContextWithoutRest
) {
  console.log("JSONL data parser is running...");

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    console.error("Failed to download JSONL", res.status);
    return;
  }

  const shopData = await db.shop.findUnique({
    where: { shop },
    select: { currencyCode: true },
  });

  const defaultMarket = shopData?.currencyCode ?? "USD";

  console.log("Default market is : ", defaultMarket);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let lineCount = 0;
  let variantCount = 0;

  // NEW: track touched products to recalc later
  const touchedProducts = new Set<bigint>();

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

      // PRODUCT LINES
      if (
        typeof record.id === "string" &&
        record.id.includes("gid://shopify/Product/") &&
        record.status
      ) {
        const productNumericId = toBigIntId(record.id);

        await db.product.upsert({
          where: { productId: productNumericId },
          create: {
            productId: productNumericId,
            status: record.status,
            handle: record.handle,
          },
          update: {
            status: record.status,
            handle: record.handle,
          },
        });

        // track product
        touchedProducts.add(productNumericId);
        continue;
      }

      // VARIANT LINES
      if (
        typeof record.id === "string" &&
        record.id.includes("gid://shopify/ProductVariant/")
      ) {
        const variantNumericId = toBigIntId(record.id);
        const parentProductId = toBigIntId(record.__parentId);

        // 1) Upsert variant row
        const variant = await db.variant.upsert({
          where: { shop_variantId: { shop, variantId: variantNumericId } },
          create: {
            shop,
            productId: parentProductId,
            variantId: variantNumericId,
          },
          update: {},
        });

        // 2) Store ONE price history row (default market only)
        const priceStr = record.price ?? "0";
        const compareAtStr =
          record.compareAtPrice != null
            ? record.compareAtPrice
            : record.price ?? "0";

        await db.priceHistory.create({
          data: {
            variant: {
              connect: { id: variant.id },
            },
            date: new Date(),
            market: defaultMarket,
            price: new Prisma.Decimal(priceStr),
            compareAtPrice: new Prisma.Decimal(compareAtStr),
            priceWithDiscounts: null,
            compareAtPriceWithDiscounts: null,
          },
        });

        // track product for Omnibus
        touchedProducts.add(parentProductId);

        variantCount++;
        continue;
      }

      // ---------- DISCOUNT TARGET PRODUCT LINES ----------
      if (
        typeof record.id === "string" &&
        record.id.includes("gid://shopify/Product/") &&
        record.__parentId &&
        typeof record.__parentId === "string" &&
        discountParentLookup.has(record.__parentId)
      ) {
        const discountId = discountParentLookup.get(record.__parentId)!;
        const entry = discountMap.get(discountId);
        if (entry) {
          const numeric = toBigIntId(record.id).toString();
          entry.productIds.add(numeric);
        }
        continue;
      }

      // ---------- DISCOUNT TARGET COLLECTION LINES ----------
      if (
        typeof record.id === "string" &&
        record.id.includes("gid://shopify/Collection/") &&
        record.__parentId &&
        typeof record.__parentId === "string" &&
        discountParentLookup.has(record.__parentId)
      ) {
        const discountId = discountParentLookup.get(record.__parentId)!;
        const entry = discountMap.get(discountId);
        if (entry) {
          const numeric = toBigIntId(record.id).toString();
          entry.collectionIds.add(numeric);
        }
        continue;
      }


      // ---------- DISCOUNT LINES ----------
      if (
        typeof record.id === "string" &&
        (
          record.id.includes("gid://shopify/DiscountCodeNode/") ||
          record.id.includes("gid://shopify/DiscountAutomaticNode/")
        ) &&
        record.discount
      ) {
        const normalized = normalizeDiscountFromBulk(record);
        if (!normalized) {
          console.warn("Could not normalize discount from bulk record:", record);
          continue;
        }

        const { discountId, type, amount } = normalized;

        // Initialize or update in the in-memory map
        let entry = discountMap.get(discountId);
        if (!entry) {
          entry = {
            discountId,
            type,
            amount,
            appliesTo: "COLLECTION",           // temporary, will recompute after we know targets
            productIds: new Set<string>(),
            collectionIds: new Set<string>(),
          };
          discountMap.set(discountId, entry);
        } else {
          entry.type = type;
          entry.amount = amount;
        }

        // Register possible parent ids for children (__parentId)
        const discountNodeGid = record.id as string;          // gid://shopify/DiscountCodeNode/...
        discountParentLookup.set(discountNodeGid, discountId);

        const discountGid = typeof record.discount.id === "string"
          ? record.discount.id as string                      // gid://shopify/DiscountCodeBasic/...
          : null;

        if (discountGid) {
          discountParentLookup.set(discountGid, discountId);
        }

        continue;
      }




      // ---------- DISCOUNT LINES ----------
      // if (
      //   typeof record.id === "string" &&
      //   (
      //     record.id.includes("gid://shopify/DiscountCodeNode/") ||
      //     record.id.includes("gid://shopify/DiscountAutomaticNode/")
      //   ) &&
      //   record.discount
      // ) {
      //   const normalized = normalizeDiscountFromBulk(record);
      //   if (!normalized) {
      //     console.warn("Could not normalize discount from bulk record:", record);
      //     continue;
      //   }
      //
      //   await db.discount.upsert({
      //     where: { discountId: normalized.discountId },
      //     create: {
      //       shop,
      //       discountId: normalized.discountId,
      //       amount: normalized.amount,
      //       type: normalized.type,
      //       appliesTo: normalized.appliesTo,
      //       productIds: normalized.productIds,
      //       collectionIds: normalized.collectionIds,
      //     },
      //     update: {
      //       amount: normalized.amount,
      //       type: normalized.type,
      //       appliesTo: normalized.appliesTo,
      //       productIds: normalized.productIds,
      //       collectionIds: normalized.collectionIds,
      //       updatedAt: new Date(),
      //     },
      //   });
      //
      //   continue;
      // }


      // For now we just log any extra records (metafields, etc.)
      console.log("<<<-------------------- Record is : ------------------->>>");
      console.log(record);
    }
  }

  // AFTER reading JSONL: persist discounts with collected targets
  for (const entry of discountMap.values()) {
    const productIdsArr = Array.from(entry.productIds);
    const collectionIdsArr = Array.from(entry.collectionIds);

    // Decide appliesTo based on what we actually collected
    let appliesTo: "PRODUCT" | "COLLECTION";
    if (productIdsArr.length && !collectionIdsArr.length) {
      appliesTo = "PRODUCT";
    } else {
      // either pure collections or "all items" / mixed -> treat as COLLECTION
      appliesTo = "COLLECTION";
    }

    await db.discount.upsert({
      where: { discountId: entry.discountId },
      create: {
        shop,
        discountId: entry.discountId,
        amount: entry.amount,
        type: entry.type,
        appliesTo,
        productIds: productIdsArr,
        collectionIds: collectionIdsArr,
      },
      update: {
        amount: entry.amount,
        type: entry.type,
        appliesTo,
        productIds: productIdsArr,
        collectionIds: collectionIdsArr,
        updatedAt: new Date(),
      },
    });
  }

  // AFTER reading JSONL: ONE central calculator call per product
  for (const productId of touchedProducts) {
    await pushOmnibusForProduct(admin, shop, productId);
  }

  console.log(
    `Parsed ${lineCount} lines and saved ${variantCount} variants for ${shop}`
  );
}


// ---------- HELPER: normalize a discountNode JSONL record ----------
type NormalizedBulkDiscount = {
  discountId: bigint;
  type: "PERCENTAGE" | "AMOUNT";
  amount: number;
  appliesTo: "PRODUCT" | "COLLECTION";
  productIds: string[];
  collectionIds: string[];
};


function normalizeDiscountFromBulk(record: any): NormalizedBulkDiscount | null {
  const discount = record.discount;
  if (!discount) return null;

  const typename = discount.__typename as string | undefined;

  // Only keep basic %/amount discounts
  if (
    typename !== "DiscountCodeBasic" &&
    typename !== "DiscountAutomaticBasic"
  ) {
    // e.g. FreeShipping, Bxgy -> ignore
    return null;
  }

  // Prefer real discount GID, fallback to node id
  const discountGid =
    typeof discount.id === "string" ? discount.id : (record.id as string);
  const discountId = toBigIntId(discountGid);

  // ----- Type + amount -----
  let type: "PERCENTAGE" | "AMOUNT" = "PERCENTAGE";
  let amount = 0;

  const value = discount.customerGets?.value;

  if (!value) {
    // No usable value → skip
    return null;
  }

  switch (value.__typename) {
    case "DiscountPercentage":
      type = "PERCENTAGE";
      amount = Number(value.percentage ?? 0);
      break;

    case "DiscountAmount":
      type = "AMOUNT";
      amount = Number(value.amount?.amount ?? 0);
      break;

    case "DiscountOnQuantity": {
      const effect = value.effect;
      if (effect?.__typename === "DiscountPercentage") {
        type = "PERCENTAGE";
        amount = Number(effect.percentage ?? 0);
      } else {
        // Non-percentage effect → skip for now
        return null;
      }
      break;
    }

    default:
      // Unsupported value type → skip
      return null;
  }

  // ----- AppliesTo + product/collection ids -----
  const productIds: string[] = [];
  const collectionIds: string[] = [];

  const items = discount.customerGets?.items;

  // items is a SINGLE union object, not an array
  if (items && typeof items === "object") {
    if (items.__typename === "DiscountProducts") {
      for (const edge of items.products?.edges ?? []) {
        const gid = edge?.node?.id as string | undefined;
        if (!gid) continue;
        const numeric = toBigIntId(gid).toString();
        if (!productIds.includes(numeric)) productIds.push(numeric);
      }
    }

    if (items.__typename === "DiscountCollections") {
      for (const edge of items.collections?.edges ?? []) {
        const gid = edge?.node?.id as string | undefined;
        if (!gid) continue;
        const numeric = toBigIntId(gid).toString();
        if (!collectionIds.includes(numeric)) collectionIds.push(numeric);
      }
    }

    if (items.__typename === "AllDiscountItems") {
      // Discount applies to ALL products.
      // For now we can:
      // - either skip (return null),
      // - or treat as COLLECTION-wide/sitewide.
      // For now, let's just treat as COLLECTION-wide without ids:
      // return null; // if you want to ignore sitewide discounts
    }
  }

  let appliesTo: "PRODUCT" | "COLLECTION";
  if (productIds.length && !collectionIds.length) {
    appliesTo = "PRODUCT";
  } else {
    appliesTo = "COLLECTION";
  }

  return {
    discountId,
    type,
    amount,
    appliesTo,
    productIds,
    collectionIds,
  };
}



export async function fetchCollection(admin: AdminApiContextWithoutRest) {
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

        // Check if product exists first
        const existingProduct = await db.product.findUnique({
          where: { productId: productNumericId },
          select: { productId: true },
        });

        if (!existingProduct) {
          // Product wasn’t imported yet -> skip
          // console.log("Skipping collection join, product not in DB:", productNumericId.toString());
          continue;
        }

        await db.product.update({
          where: { productId: existingProduct.productId },
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
