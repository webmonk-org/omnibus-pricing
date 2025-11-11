import type { SessionData } from "@remix-run/node";
import db from "app/db.server";
import type { AdminApiContextWithoutRest } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients";
import { processVariants, updateCalculationInProgress } from "./process-variants";
import type { VariantRecord } from "app/types";

export async function uninstalled(shop: string) {
  await db.session.deleteMany({ where: { shop } });
}

export async function scopesUpdate(payload: any, session: SessionData) {
  const current = payload.current as string[];
  await db.session.update({
    where: {
      id: session.id
    },
    data: {
      scope: current.toString(),
    },
  });
};


export async function bulkOpFinish(admin: AdminApiContextWithoutRest, id: string, shop: string, session: SessionData) {
  console.log("(Running...) Bulk operaton fish")
  // const bulkOpId = payload.admin_graphql_api_id;

  const result = await admin.graphql(
    `#graphql
      query getBulkOp($id: ID!) {
        node(id: $id) {
          ... on BulkOperation {
            id
            status
            errorCode
            url
            partialDataUrl
            objectCount
          }
        }
      }
    `,
    { variables: { id } },
  );

  const { data } = await result.json();
  const bulkOp = data.node;

  if (!bulkOp || bulkOp.status !== "COMPLETED" || !bulkOp.url) {
    console.log("Bulk op not ready or missing url", { shop, bulkOp });
    return new Response();
  }

  // Save the variants in DB
  processVariants(bulkOp.url, shop)

  // set calculationInProgress to false
  updateCalculationInProgress(session, false);
}

export async function handleProductCreate(payload: any, shop: string) {
  try {
    if (!payload || !Array.isArray(payload.variants) || payload.variants.length === 0) {
      console.log("product/create webhook with no variants, nothing to do");
      return;
    }

    console.log("Comming payload is : ", payload);

    const productId = BigInt(payload.id);
    const productStatus =
      payload.status === "active" || payload.status === "ACTIVE"
        ? "active"
        : "archived";

    const variantsData = payload.variants.map((v: any) => ({
      shop,
      productId,
      variantId: BigInt(v.id),
      status: productStatus,
      complianceStatus: "not_enough_data",
    }));

    await db.$transaction(async (tx) => {
      // Ensure the product exists first
      await tx.product.upsert({
        where: { productId },
        create: {
          productId,
          handle: payload.handle,
        },
        update: {
          handle: payload.handle,
        },
      });

      // create the variants pointing at that product
      await tx.variant.createMany({
        data: variantsData,
        skipDuplicates: true,
      });
    });

    console.log(
      `Created ${variantsData.length} variants for product ${productId} in shop ${shop}`
    );
  } catch (err) {
    console.error("Error creating product: ", err);
  }
}


export async function handleProductUpdate(payload: any, shop: string) {
  try {
    if (!payload || !Array.isArray(payload.variants) || payload.variants.length === 0) {
      console.log("products/update webhook with no variants, nothing to do");
      return;
    }

    const productId = BigInt(payload.id);

    const productStatus =
      payload.status === "active" || payload.status === "ACTIVE"
        ? "active"
        : "archived";

    const variantsData = payload.variants.map((v: any) => ({
      shop,
      productId,
      variantId: BigInt(v.id),
      status: productStatus,
    }));

    await db.$transaction(async (tx) => {
      // ensure product is in sync
      await tx.product.upsert({
        where: { productId },
        create: {
          productId,
          handle: payload.handle,
        },
        update: {
          handle: payload.handle,
        },
      });

      // epsert each variant
      await Promise.all(
        variantsData.map((v: VariantRecord) =>
          tx.variant.upsert({
            where: {
              shop_variantId: {
                shop: v.shop,
                variantId: v.variantId,
              },
            },
            create: {
              shop: v.shop,
              productId: v.productId,
              variantId: v.variantId,
              status: v.status,
            },
            update: {
              productId: v.productId,
              status: v.status,
            },
          })
        )
      );
    });

    console.log(
      `Upserted ${variantsData.length} variants for product ${productId} in shop ${shop} (products/update)`
    );
  } catch (err) {
    console.error("Error Updating products: ", err);
  }
}


export async function handleProductDelete(payload: any, shop: string) {
  try {
    if (!payload || !payload.id) {
      console.log("products/delete webhook without product id, nothing to do");
      return;
    }

    const productId = BigInt(payload.id);

    await db.$transaction(async (tx) => {
      // Delete variants for this product + shop
      const variantsResult = await tx.variant.deleteMany({
        where: {
          shop,
          productId,
        },
      });

      //  Optionally delete the product row itself
      const productResult = await tx.product.deleteMany({
        where: { productId },
      });

      console.log(
        `products/delete: removed ${variantsResult.count} variants and ${productResult.count} product rows for product ${productId} in shop ${shop}`
      );
    });
  } catch (err) {
    console.error("Error deleting product: ", err);
  }
}
