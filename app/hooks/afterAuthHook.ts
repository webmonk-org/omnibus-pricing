import type { Session } from '@shopify/shopify-app-remix/server';
import db from '../db.server'
import type { AdminApiContextWithoutRest } from 'node_modules/@shopify/shopify-app-remix/dist/ts/server/clients';
import type { Shop } from '@prisma/client';
import { triggerBulkOperation } from 'app/utils/trigger-bulk-operation';
import { getOmnibusSettings, updateCalculationInProgress } from 'app/utils/helpers';
import { createProductMetafieldDefinitions } from 'app/utils/product-metafield';
import { DEFAULT_SETTINGS } from 'app/types';

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

async function computeDiscountDateRange(shop: string) {
  // let settings = await getOmnibusSettings(shop);
  const settings = DEFAULT_SETTINGS;
  console.log("Settings (getOmnibusSettings) : ", settings);

  // Use campaignLength OR timeframe as the dayLimit (pick what makes sense for you)
  const dayLimit = settings.timeframe;

  const effectiveDayLimit = dayLimit && dayLimit > 0 ? dayLimit : 90;

  // "Number of months" ≈ dayLimit / 30 (rounded)
  const monthsBack = Math.round(effectiveDayLimit / 30);

  const now = new Date();
  const endDate = now.toISOString();

  const start = new Date(now);
  start.setMonth(start.getMonth() - monthsBack);
  start.setHours(0, 0, 0, 0); // normalize to midnight
  const startDate = start.toISOString();

  return { startDate, endDate };
}


export async function afterAuthHook({ admin, session }: { admin: AdminApiContextWithoutRest; session: Session }) {
  try {
    const shopObject = await getShop(admin);

    // save to db
    await db.shop.create(
      { data: shopObject }
    );

    // trigger a bulk operation job


    const { startDate, endDate } = await computeDiscountDateRange(session.shop);
    console.log("Start date: ", startDate);
    console.log("End date : ", endDate);

    const status = await triggerBulkOperation(admin,
      startDate,
      endDate
    );

    console.log("Status: ", status);

    // create metafield definition for product
    createProductMetafieldDefinitions(admin);

    // set calculationInProgress to true
    updateCalculationInProgress(session, true);

  } catch (error) {
    console.log(`Error on afterAuthHook:  `, error);
  }
}
