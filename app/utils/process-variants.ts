import db from "app/db.server";
import type { DiscountContext } from "app/types";

function mapProductStatus(shopifyStatus?: string | null): "active" | "archived" {
  return shopifyStatus === "ACTIVE" ? "active" : "archived";
}

// productId (numeric) -> status
const productStatus = new Map<bigint, "active" | "archived">();

// 🔧 Helper: GID or plain numeric -> BigInt numeric ID
function toBigIntId(raw: string | number | bigint | undefined): bigint {
  if (raw === undefined || raw === null) {
    throw new Error("toBigIntId received undefined/null");
  }

  if (typeof raw === "bigint") return raw;
  if (typeof raw === "number") return BigInt(raw);

  // string: "gid://shopify/Product/9008472228089" OR "9008472228089"
  const match = raw.match(/(\d+)$/);
  if (!match) {
    throw new Error(`Could not extract numeric ID from value: ${raw}`);
  }
  return BigInt(match[1]);
}

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

      const rawId = record.id as string | undefined;
      const rawParentId = record.__parentId as string | undefined;

      // 🧱 Product row (no __parentId, has status)
      if (rawId && !rawParentId && record.status) {
        const productId = toBigIntId(rawId); // BigInt numeric
        const status = mapProductStatus(record.status);

        console.log("Product row:");
        console.log("  raw product GID:", rawId);
        console.log("  numeric productId:", productId.toString());
        console.log("  mapped status:", status);

        productStatus.set(productId, status);
        continue;
      }

      // 🧬 Variant row (has __parentId)
      if (rawId && rawParentId) {
        const variantId = toBigIntId(rawId);        // BigInt numeric
        const productId = toBigIntId(rawParentId);  // BigInt numeric
        const status = productStatus.get(productId) ?? "active";

        console.log("Variant row:");
        console.log("  raw variant GID:", rawId);
        console.log("  raw product GID:", rawParentId);
        console.log("  numeric variantId:", variantId.toString());
        console.log("  numeric productId:", productId.toString());
        console.log("  resolved status:", status);

        const discountData = await computeVariantDiscountFields({
          record,
          shop,
          variantId,  // bigint
          productId,  // bigint (in case DiscountContext uses it later)
          status,
        });

        console.log("Saving variant:", {
          shop,
          variantId: variantId.toString(),
          productId: productId.toString(),
          status,
        });

        await db.variant.upsert({
          where: {
            // matches @@unique([shop, variantId]) → name: shop_variantId
            shop_variantId: {
              shop,
              variantId,
            },
          },
          update: {
            productId,
            status,
            currentDiscountStartedAt: discountData.currentDiscountStartedAt,
            complianceStatus: discountData.complianceStatus,
            // if you later add lastProcessedAt to Variant, set it here:
            // lastProcessedAt: discountData.lastProcessedAt,
          },
          create: {
            shop,
            productId,
            variantId,
            status,
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

export async function computeVariantDiscountFields({
  record,
  shop,
  variantId,
}: DiscountContext) {
  const now = new Date();

  const price =
    record.price != null ? parseFloat(record.price) : null;
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
    // Until we’ve done Omnibus checks
    if (!complianceStatus || complianceStatus === "not_on_sale") {
      complianceStatus = "not_enough_data";
    }
  } else {
    // No discount so not on sale
    currentDiscountStartedAt = null;
    complianceStatus = "not_on_sale";
  }

  return {
    lastProcessedAt: now, // not stored yet, but useful if you add a field later
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
  return;
}
