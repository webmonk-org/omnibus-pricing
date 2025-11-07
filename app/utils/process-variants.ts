import type { SessionData } from "@remix-run/node";
import db from "app/db.server";
import type { DiscountContext } from "app/types";

function mapProductStatus(shopifyStatus?: string | null): "active" | "archived" {
  if (shopifyStatus === "ACTIVE") return "active";
  return "archived";
}

// productId -> status
const productStatus = new Map<string, "active" | "archived">();

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

      const id = record.id as string | undefined;
      const parentId = record.__parentId as string | undefined;

      // Product row (no __parentId, has status)
      if (id && !parentId && record.status) {
        const status = mapProductStatus(record.status);
        productStatus.set(id, status);
        continue;
      }

      // Variant row (has __parentId)
      if (id && parentId) {
        const variantId = id;
        const productId = parentId;
        const status = productStatus.get(productId) ?? "active";

        // 🔍 compute discount-related fields + lastProcessedAt
        const discountData = await computeVariantDiscountFields({
          record,
          shop,
          variantId,
          productId,
          status,
        });

        console.log("Saving variant:", { variantId, productId, status });

        await db.variant.upsert({
          where: {
            shop_variantId: { shop, variantId },
          },
          update: {
            productId,
            status,
            lastProcessedAt: discountData.lastProcessedAt,
            currentDiscountStartedAt: discountData.currentDiscountStartedAt,
            complianceStatus: discountData.complianceStatus,
          },
          create: {
            shop,
            productId,
            variantId,
            status,
            lastProcessedAt: discountData.lastProcessedAt,
            currentDiscountStartedAt: discountData.currentDiscountStartedAt,
            complianceStatus: discountData.complianceStatus,
          },
        });

        variantCount++;
      }
    }
  }

  console.log(
    `Parsed ${lineCount} lines and saved ${variantCount} variants for ${shop}`,
  );
}


async function computeVariantDiscountFields({
  record,
  shop,
  variantId,
}: DiscountContext) {
  const now = new Date();

  const price = record.price != null ? parseFloat(record.price) : null;
  const compareAtPrice =
    record.compareAtPrice != null ? parseFloat(record.compareAtPrice) : null;

  const isDiscounted =
    price !== null &&
    compareAtPrice !== null &&
    compareAtPrice > price;

  const existing = await db.variant.findUnique({
    where: {
      shop_variantId: { shop, variantId },
    },
  });

  let currentDiscountStartedAt: Date | null =
    existing?.currentDiscountStartedAt ?? null;
  let complianceStatus: string | null = existing?.complianceStatus ?? null;

  if (isDiscounted) {
    // Newly discounted so start period now
    if (!existing?.currentDiscountStartedAt) {
      currentDiscountStartedAt = now;
    }
    // Until we done Omnibus checks
    if (!complianceStatus || complianceStatus === "not_on_sale") {
      complianceStatus = "not_enough_data";
    }
  } else {
    // No discount so not on sale
    currentDiscountStartedAt = null;
    complianceStatus = "not_on_sale";
  }

  return {
    lastProcessedAt: now,
    currentDiscountStartedAt,
    complianceStatus,
  };
}

export async function updateCalculationInProgress(session: SessionData, BoolValue: boolean) {
  try {
    await db.session.update({
      where: { shop: session.shop },
      data: {
        calculationInProgress: BoolValue,
      },
    });
  } catch (err) {
    console.error("Error updating calculationInProgress: ", err)
  }
}
