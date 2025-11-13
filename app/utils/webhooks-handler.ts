import type { SessionData } from "@remix-run/node";
import db from "app/db.server";
import type { AdminApiContextWithoutRest } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients";
import { processBulkData } from "./process-bulk-data";
import { updateCalculationInProgress, toBigIntId, fetchAndNormalizeDiscount } from "./helpers"

import type { VariantRecord } from "app/types";
import { triggerCalculationForSelectedProducts } from "./calculate-omnibus-price";

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
  processBulkData(bulkOp.url, shop)

  // set calculationInProgress to false
  updateCalculationInProgress(session, false);
}

export async function handleProductCreate(payload: any, shop: string) {
  try {
    console.log("Comming payload is : ", payload);

    const productId = BigInt(payload.id);
    const productStatus =
      payload.status === "active" || payload.status === "ACTIVE"
        ? "active"
        : "archived";


    // calcualte monibus
    const { currentDiscountStartedAt, complianceStatus } = await triggerCalculationForSelectedProducts(payload, shop)

    console.log("currentDiscountStartedAt: ", currentDiscountStartedAt);
    console.log("complianceStatus: ", complianceStatus);

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


export async function handleCreateCollection(payload: any, shop: string, admin: AdminApiContextWithoutRest) {
  try {
    const collectionId = BigInt(payload.id);
    const handle = payload.handle;


    await db.collection.upsert({
      where: { collectionId },
      create: {
        collectionId,
        handle,
      },
      update: {
        handle,
      },
    });


    // just in case user create a collection with
    // products right away

    const graphqlId = `gid://shopify/Collection/${payload.id}`;

    const query = `
      query GetCollectionProducts($id: ID!) {
        collection(id: $id) {
          id
          handle
          products(first: 250) {
            edges {
              node {
                id
                handle
              }
            }
          }
        }
      }
    `;

    const res = await admin.graphql(query, {
      variables: { id: graphqlId },
    })


    const json = await res.json();

    const products =
      json.data?.collection?.products?.edges?.map((e: any) => e.node) ?? [];

    console.log("products:", products);

    // Sync product relationships
    await db.collection.update({
      where: { collectionId },
      data: {
        products: {
          set: [], // remove old links
          connectOrCreate: products.map((p: any) => ({
            where: { productId: BigInt(p.id.replace("gid://shopify/Product/", "")) },
            create: {
              productId: BigInt(p.id.replace("gid://shopify/Product/", "")),
              handle: p.handle,
            },
          })),
        },
      },
    });


    console.log(
      `collections/create: upserted collection ${collectionId} (handle=${handle}) for shop ${shop}`
    );
  } catch (err) {
    console.error("Error creating collection: ", err);
  }
}


export async function handleUpdateCollection(payload: any, shop: string, admin: AdminApiContextWithoutRest) {
  try {
    const collectionId = BigInt(payload.id);

    const collectionWithProducts = await db.collection.findUnique({
      where: { collectionId: collectionId },
      include: {
        products: true,
      },
    });

    console.log("collectionWithProducts: ", collectionWithProducts);

    const handle = payload.handle;

    await db.collection.upsert({
      where: { collectionId },
      create: {
        collectionId,
        handle,
      },
      update: {
        handle,
      },
    });


    const graphqlId = `gid://shopify/Collection/${payload.id}`;

    const query = `
      query GetCollectionProducts($id: ID!) {
        collection(id: $id) {
          id
          handle
          products(first: 250) {
            edges {
              node {
                id
                handle
              }
            }
          }
        }
      }
    `;

    const res = await admin.graphql(query, {
      variables: { id: graphqlId },
    })


    const json = await res.json();

    const products =
      json.data?.collection?.products?.edges?.map((e: any) => e.node) ?? [];

    console.log("products:", products);

    // Sync product relationships
    await db.collection.update({
      where: { collectionId },
      data: {
        products: {
          set: [], // remove old links
          connectOrCreate: products.map((p: any) => ({
            where: { productId: BigInt(p.id.replace("gid://shopify/Product/", "")) },
            create: {
              productId: BigInt(p.id.replace("gid://shopify/Product/", "")),
              handle: p.handle,
            },
          })),
        },
      },
    });

    console.log(
      `collections/update: upserted collection ${collectionId} (handle=${handle}) for shop ${shop}`
    );
  } catch (err) {
    console.error("Error updating collection: ", err);
  }
}

export async function handleDeleteCollection(payload: any, shop: string) {
  try {
    const collectionId = BigInt(payload.id);

    const result = await db.collection.deleteMany({
      where: { collectionId },
    });

    console.log(
      `collections/delete: removed ${result.count} collection row(s) for collectionId ${collectionId} in shop ${shop}`
    );
  } catch (err) {
    console.error("Error deleting collection: ", err);
  }
}


export async function handleDiscountCreateOrUpdate(
  payload: any,
  shop: string,
  admin: AdminApiContextWithoutRest
) {
  try {

    console.log("Running  handleDiscountCreateOrUpdate ----");

    const gid = payload.admin_graphql_api_id as string;
    if (!gid) {
      console.error("Discount webhook missing admin_graphql_api_id");
      return;
    }

    const discountId = toBigIntId(gid);
    const norm = await fetchAndNormalizeDiscount(admin, gid);
    console.log("Norm is : ", norm);

    if (!norm) {
      console.error("Unsupported/empty discount payload for GID", gid);
      return;
    }

    console.log("amount is : ", norm.amount);
    await db.discount.upsert({
      where: { discountId },
      create: {
        shop,
        discountId,
        amount: norm.amount,
        type: norm.type,
        appliesTo: norm.appliesTo,
        productIds: norm.productIds,
        collectionIds: norm.collectionIds,
      },
      update: {
        amount: norm.amount,
        type: norm.type,
        appliesTo: norm.appliesTo,
        productIds: norm.productIds,
        collectionIds: norm.collectionIds,
        updatedAt: new Date(),
      },
    });

    console.log(
      `discounts/create|update: ${discountId.toString()} ` +
      `(type=${norm.type}, amount=${norm.amount}, appliesTo=${norm.appliesTo}, ` +
      `products=${norm.productIds.length}, collections=${norm.collectionIds.length})`
    );
  } catch (err) {
    console.error("Error handling discount create/update:", err);
  }
}

export async function handleDiscountDelete(payload: any, shop: string) {
  try {
    const gid = payload.admin_graphql_api_id as string;
    if (!gid) {
      console.error("Discount delete webhook missing admin_graphql_api_id");
      return;
    }

    const discountId = toBigIntId(gid);

    const result = await db.discount.deleteMany({
      where: { shop, discountId },
    });

    console.log(
      `discounts/delete: removed ${result.count} discount row(s) for discountId ${discountId.toString()} in shop ${shop}`
    );
  } catch (err) {
    console.error("Error deleting discount:", err);
  }
}

