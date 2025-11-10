import type { SessionData } from "@remix-run/node";
import db from "app/db.server";
import type { AdminApiContextWithoutRest } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients";
import { processVariants, updateCalculationInProgress } from "./process-variants";

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

export async function handleProductCreate(
  payload: any,
  shop: string,
) {
  try {
    if (!payload || !Array.isArray(payload.variants) || payload.variants.length === 0) {
      console.log("product/create webhook with no variants, nothing to do");
      return;
    }

    const productId = BigInt(payload.id);
    const productStatus =
      payload.status === "active" || payload.status === "ACTIVE"
        ? "active"
        : "archived";

    const now = new Date();

    const variantsData = payload.variants.map((v: any) => ({
      shop,
      productId,
      variantId: BigInt(v.id),
      status: productStatus,
      complianceStatus: "not_enough_data",
      createdAt: now,
      updatedAt: now,
    }));

    await db.variant.createMany({
      data: variantsData,
      skipDuplicates: true,
    });

    console.log(
      `Created ${variantsData.length} variants for product ${productId} in shop ${shop}`
    );

  } catch (err) {
    console.error("Error creating product: ", err)
  }
}

export async function handleProductUpdate(payload: any, shop: string) {
  try {
    if (!payload || !Array.isArray(payload.variants) || payload.variants.length === 0) {
      console.log("products/update webhook with no variants, nothing to do");
      return;
    }

    // Use GraphQL product GID (matches what you store in DB)
    const productId = BigInt(payload.id);

    const productStatus =
      payload.status === "active" || payload.status === "ACTIVE"
        ? "active"
        : "archived";

    // Collect variant GIDs from payload
    const variantIds = payload.variants.map((v: any) => BigInt(v.id));

    // 1️⃣ Find which variants already exist in DB for this shop + product
    const existingVariants = await db.variant.findMany({
      where: {
        shop,
        productId,
        variantId: { in: variantIds },
      },
      select: { variantId: true },
    });

    const existingIds = new Set(existingVariants.map((v) => v.variantId));

    // 2️⃣ Build only the variants that we actually have in DB
    const variantsToUpdate = payload.variants.filter((v: any) =>
      existingIds.has(BigInt(v.id).toString())
    );

    if (variantsToUpdate.length === 0) {
      console.log(
        `products/update: no existing variants found in DB for product ${productId} in shop ${shop}`
      );
      return;
    }

    const now = new Date();

    // 3️⃣ Update each existing variant
    await Promise.all(
      variantsToUpdate.map((v: any) =>
        db.variant.update({
          where: {
            shop_variantId: {
              shop,
              variantId: BigInt(v.id),
            },
          },
          data: {
            productId,
            status: productStatus,
            updatedAt: now,
            // Todo: omnibus fields
          },
        })
      )
    );

    console.log(
      `Updated ${variantsToUpdate.length}/${payload.variants.length} variants for product ${productId} in shop ${shop}`
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

    const productId = String(payload.id);

    const result = await db.variant.deleteMany({
      where: {
        shop,
        productId,
      },
    });

    console.log(
      `products/delete: removed ${result.count} variants for product ${productId} in shop ${shop}`
    );
  } catch (err) {
    console.error("Error deleting product: ", err);
  }
}









