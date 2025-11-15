import type { Session } from '@shopify/shopify-app-remix/server';
import db from '../db.server'
import type { AdminApiContextWithoutRest } from 'node_modules/@shopify/shopify-app-remix/dist/ts/server/clients';
import type { Shop } from '@prisma/client';
import { triggerBulkOperation } from 'app/utils/trigger-bulk-operation';
import { triggerCalculationForSelectedProducts, updateCalculationInProgress } from 'app/utils/helpers';
import { bulkOpFinish } from 'app/utils/webhooks-handler';
import { createProductMetafieldDefinitions } from 'app/utils/product-metafield';

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


export async function afterAuthHook({ admin, session }: { admin: AdminApiContextWithoutRest; session: Session }) {
  try {
    const shopObject = await getShop(admin);

    // save to db
    await db.shop.create(
      { data: shopObject }
    );

    // trigger a builk operation job
    const bulkOp = await triggerBulkOperation(admin);

    bulkOpFinish(admin, bulkOp.id, session.shop, session)

    // create metafield definition for product
    createProductMetafieldDefinitions(admin);

    // set calculationInProgress to true
    updateCalculationInProgress(session, true);

  } catch (error) {
    console.log(`Error on afterAuthHook:  `, error);
  }
}
