import type { SessionData } from '@remix-run/node';
import db from 'app/db.server'
import type { DiscountContext, DiscountItem, NormalizedTargets } from 'app/types';
import type { AdminApiContextWithoutRest } from 'node_modules/@shopify/shopify-app-remix/dist/ts/server/clients';

export function toBigIntId(raw: string | number | bigint | undefined): bigint {
  if (raw === undefined || raw === null) {
    throw new Error("toBigIntId received undefined/null");
  }

  if (typeof raw === "bigint") return raw;
  if (typeof raw === "number") return BigInt(raw);

  const match = raw.match(/(\d+)$/);
  if (!match) {
    throw new Error(`Could not extract numeric ID from value: ${raw}`);
  }
  return BigInt(match[1]);
}

export function moneyToMinorUnits(amountStr: string, decimals = 2): number {
  // NOTE: For zero-decimal currencies you can pass decimals=0.
  const x = Number(amountStr);
  return Math.round(x * Math.pow(10, decimals));
}


export function mapProductStatus(shopifyStatus?: string | null): "active" | "archived" {
  return shopifyStatus === "ACTIVE" ? "active" : "archived";
}


export async function getActiveDiscountsForProduct(
  shop: string,
  productId: bigint,
  productCollectionIds: bigint[]
) {
  const productIdStr = productId.toString();
  const collectionIdStrs = productCollectionIds.map((c) => c.toString());

  // If you later store status/startsAt/endsAt, add them in this filter.
  return db.discount.findMany({
    where: {
      shop,
      OR: [
        { productIds: { has: productIdStr } },
        { collectionIds: { hasSome: collectionIdStrs } },
      ],
    },
  });
}

export function mapDiscountType(raw?: string | null): string {
  switch (raw) {
    case "DiscountCodeBasic":
      return "code_basic";
    case "DiscountAutomaticBasic":
      return "automatic_basic";
    case "DiscountCodeBxgy":
      return "code_bxgy";
    default:
      return raw ?? "unknown";
  }
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



const DISCOUNT_TARGETS_QUERY = `#graphql
  query GetDiscountTargets($id: ID!) {
    discountNode(id: $id) {
      id
      discount {
        __typename

        # Amount-off automatic (no code)
        ... on DiscountAutomaticBasic {
          customerGets {
            items {
              __typename
              ... on DiscountProducts {
                products(first: 250) { nodes { id handle } }
                productVariants(first: 250) { nodes { id } }
              }
              ... on DiscountCollections {
                collections(first: 250) { nodes { id handle } }
              }
              ... on AllDiscountItems { allItems }
            }
            value {
              __typename
              ... on DiscountPercentage { percentage }
              ... on DiscountAmount { amount { amount currencyCode } appliesOnEachItem }
            }
          }
        }

        # Amount-off with a code
        ... on DiscountCodeBasic {
          customerGets {
            items {
              __typename
              ... on DiscountProducts {
                products(first: 250) { nodes { id handle } }
                productVariants(first: 250) { nodes { id } }
              }
              ... on DiscountCollections {
                collections(first: 250) { nodes { id handle } }
              }
              ... on AllDiscountItems { allItems }
            }
            value {
              __typename
              ... on DiscountPercentage { percentage }
              ... on DiscountAmount { amount { amount currencyCode } appliesOnEachItem }
            }
          }
        }

        # TODO: Add other types (BxGy, FreeShipping) if you decide to support them.
      }
    }
  }
`;

export async function fetchAndNormalizeDiscount(
  admin: AdminApiContextWithoutRest,
  shopifyGid: string
): Promise<NormalizedTargets | null> {
  console.log("fetchAndNormalizeDiscount ----")
  const res = await admin.graphql(DISCOUNT_TARGETS_QUERY, { variables: { id: shopifyGid } });
  const json = await res.json();

  const node = json?.data?.discountNode;
  const discount = node?.discount;
  if (!discount) {
    console.warn("No discount for GID", shopifyGid, JSON.stringify(json));
    return null;
  }

  const productIds: string[] = [];
  const collectionIds: string[] = [];

  const rawItems = discount?.customerGets?.items;
  const items = rawItems == null
    ? []
    : Array.isArray(rawItems)
      ? rawItems
      : [rawItems];

  let seenCollections = false;

  for (const it of items) {
    if (!it || !it.__typename) continue;

    if (it.__typename === "DiscountProducts") {
      const products = it.products?.nodes ?? [];
      for (const p of products) {
        if (!p?.id) continue;
        productIds.push(toBigIntId(p.id).toString());
      }
      // (optional) it.productVariants?.nodes for variant-level targeting
      continue;
    }

    if (it.__typename === "DiscountCollections") {
      seenCollections = true;
      const cols = it.collections?.nodes ?? [];
      for (const c of cols) {
        if (!c?.id) continue;
        collectionIds.push(toBigIntId(c.id).toString());
      }
      continue;
    }

    if (it.__typename === "AllDiscountItems") {
      // Sitewide: treat as PRODUCT (applies to all products)
      continue;
    }

    // Unknown union member — ignore safely
    console.log("Unhandled customerGets.items typename:", it.__typename);
  }

  const appliesTo: "PRODUCT" | "COLLECTION" =
    seenCollections ? "COLLECTION" : "PRODUCT";

  // ---- VALUE (how much) ----
  const value = discount?.customerGets?.value;
  if (!value || !value.__typename) {
    console.warn("No customerGets.value for GID", shopifyGid);
    return {
      productIds: [...new Set(productIds)],
      collectionIds: [...new Set(collectionIds)],
      appliesTo,
      // Fallbacks if you want to persist anyway; or return null to skip
      type: "percentage",
      amount: 0
    };
  }

  let type: "percentage" | "fixed_amount";
  let amount: number;

  switch (value.__typename) {
    case "DiscountPercentage": {
      console.log("persentage is :", value.percentage);
      amount = Number(value.percentage ?? 0);
      type = "percentage";
      break;
    }
    case "DiscountAmount": {
      const amt = value.amount?.amount ?? "0";
      // If you need exact decimals per currency, add a currency map.
      amount = moneyToMinorUnits(amt, 2);
      type = "fixed_amount";
      break;
    }
    default: {
      console.log("Unhandled customerGets.value typename:", value.__typename);
      // Choose to skip or store a neutral value:
      type = "percentage";
      amount = 0;
      break;
    }
  }

  return {
    productIds: [...new Set(productIds)],
    collectionIds: [...new Set(collectionIds)],
    appliesTo,
    type,
    amount,
  };
}
