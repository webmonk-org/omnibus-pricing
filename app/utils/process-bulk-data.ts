import db from "app/db.server";
import { getOmnibusSettings, toBigIntId } from "./helpers";
import { triggerCalculationForSelectedProducts } from "./calculate-omnibus-price";
import { Prisma } from "@prisma/client";
import type { AdminApiContextWithoutRest } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients";
import { setOmnibusMetafieldsForVariant } from "./product-metafield";
import type {
  OmnibusPriceHistoryMetafield,
  OmnibusSummaryMetafield,
} from "app/types";

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

  const settings = await getOmnibusSettings(shop);
  console.log("Settings (process-bulk): ", settings);

  // Default market only for now.
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

        // 3) Run Omnibus calculation
        const calc = await triggerCalculationForSelectedProducts(
          record,
          shop,
          settings
        );
        console.log("Calc is : ", calc);

        // 4) Push metafields for each variant result
        for (const result of calc) {
          const variantGid = `gid://shopify/ProductVariant/${result.variantId.toString()}`;

          const latest = await db.priceHistory.findFirst({
            where: { variantId: variant.id },
            orderBy: { date: "desc" },
          });

          const currentPrice = latest ? Number(latest.price) : null;

          const summary: OmnibusSummaryMetafield = {
            market: defaultMarket,
            current_price: currentPrice,
            omnibus_price: result.omnibusPrice,
            compliance_status: result.complianceStatus,
            last_calculated_at: new Date().toISOString(),
          };

          const historyRows = await db.priceHistory.findMany({
            where: { variantId: variant.id, market: defaultMarket },
            orderBy: { date: "desc" },
            take: settings.timeframe ?? 30,
          });

          const history: OmnibusPriceHistoryMetafield = {
            market: defaultMarket,
            timeframe_days: settings.timeframe ?? 30,
            entries: historyRows.map((row) => ({
              date: row.date.toISOString(),
              price: Number(row.price),
              compare_at_price: row.compareAtPrice
                ? Number(row.compareAtPrice)
                : null,
            })),
          };

          await setOmnibusMetafieldsForVariant({
            admin,
            variantGid,
            summary,
            history,
          });
        }

        variantCount++;
        continue;
      }

      // For now we just log any extra records (metafields, etc.)
      console.log("<<<-------------------- Record is : ------------------->>>");
      console.log(record);
    }
  }

  console.log(
    `Parsed ${lineCount} lines and saved ${variantCount} variants for ${shop}`
  );
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
