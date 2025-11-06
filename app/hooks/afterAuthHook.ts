import type { Session } from '@shopify/shopify-app-remix/server';
import db from '../db.server'
import type { AdminApiContextWithoutRest } from 'node_modules/@shopify/shopify-app-remix/dist/ts/server/clients';
import type { Shop } from '@prisma/client';
import { registerWebhooks } from "app/shopify.server"

async function getShop(admin: AdminApiContextWithoutRest) {
  const query = `
    query {
      currentAppInstallation {
        id
      }
      shop {
        createdAt
        id
        myshopifyDomain
        primaryDomain {
          url
        }
        name
        plan {
          displayName
          partnerDevelopment
          shopifyPlus
        }
        email
        shopOwnerName
        currencyCode
        ianaTimezone
        billingAddress {
          company
          city
          country
          countryCodeV2
          phone
        }
      }
    }
  `;

  const response = await admin.graphql(query);

  const { data } = await response.json();

  const shop = data.shop;

  const shopObject = {
    shop: shop.myshopifyDomain,
    myshopifyDomain: shop.myshopifyDomain,
    shopId: shop.id,
    primaryDomain: shop.primaryDomain?.url,
    shopName: shop.name,
    planName: shop.plan?.displayName,
    isShopifyPlus: shop.plan?.shopifyPlus,
    isDevStore: shop.plan?.partnerDevelopment,
    ownerEmail: shop.email,
    ownerName: shop.shopOwnerName,
    currencyCode: shop.currencyCode,
    ianaTimezone: shop.ianaTimezone,
    billingCompany: shop.billingAddress?.company,
    billingCity: shop.billingAddress?.city,
    billingCountry: shop.billingAddress?.country,
    billingCountryCode: shop.billingAddress?.countryCodeV2,
    billingPhone: shop.billingAddress?.phone,
    creationDate: shop.createdAt,
    createdAt: new Date(),
    updatedAt: new Date()
  } as Shop;

  return shopObject;
}

async function triggerBulkOperation(admin: AdminApiContextWithoutRest) {
  const mutation = `
    mutation {
      bulkOperationRunQuery(
        query: """
        {
          products {
            edges {
              node {
                id
                title
                status
                variants {
                  edges {
                    node {
                      id
                      title
                      sku
                      price
                      compareAtPrice
                      inventoryQuantity
                    }
                  }
                }
              }
            }
          }
          collections {
            edges {
              node {
                id
                title
                handle
              }
            }
          }
        }
        """
      ) {
        bulkOperation {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await admin.graphql(mutation);
  const { data } = await result.json();

  return data.bulkOperationRunQuery.bulkOperation.status;

}

export async function afterAuthHook({ admin, session }: { admin: AdminApiContextWithoutRest; session: Session }) {
  await registerWebhooks({ session });
  console.log("app url : ", process.env.SHOPIFY_APP_URL)
  try {
    const shopObject = await getShop(admin);

    // save to db
    await db.shop.create(
      { data: shopObject }
    );

    const status = await triggerBulkOperation(admin);
    console.log("Bulk status: ", status)

  } catch (error: any) {
    console.log(`Error on afterAuthHook:  `);
  }
}
