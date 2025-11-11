import type { ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from 'app/shopify.server';
import { bulkOpFinish, handleCreateCollection, handleDeleteCollection, handleProductCreate, handleProductDelete, handleProductUpdate, handleUpdateCollection, scopesUpdate, uninstalled } from 'app/utils/webhooks-handler';

const webhookIdsStore = new Set<string>();
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, topic, session, payload, webhookId, admin } = await authenticate.webhook(request);

    if (webhookIdsStore.has(webhookId)) {
      console.log(`Duplicate webhook received for webhookId: ${webhookId}. Skipping processing.`);
      return new Response();
    } else {
      webhookIdsStore.add(webhookId);
    }

    if (!payload || !payload.id) {
      console.log("Missing payload!");
      return;
    }

    console.log('------------------ Webhook Received ------------------');
    console.log('webhookId: ', webhookId);
    console.log('topic: ', topic);
    console.log('shop: ', shop);
    console.log('payload: ', JSON.stringify(payload));
    console.log('------------------------------------------------------');

    if (!session) {
      return new Response();
    }

    // for later:
    // await sendWebhookToQueue({
    //   shop,
    //   topic,
    //   payload,
    //   receivedAt: new Date().toISOString()
    // })

    switch (topic) {
      case 'APP_UNINSTALLED':
        await uninstalled(shop);
        break;
      case 'BULK_OPERATIONS_FINISH':
        await bulkOpFinish(admin, payload.admin_graphql_api_id, shop, session)
        break;
      case 'APP_SCOPES_UPDATE':
        await scopesUpdate(payload, session);
        break;
      // shop updates:
      case 'SHOP_UPDATE':
        console.log("update shop");
        break;
      // product related topics:
      case 'PRODUCTS_CREATE':
        handleProductCreate(payload, shop)
        break;
      case 'PRODUCTS_UPDATE':
        handleProductUpdate(payload, shop)
        break;
      case 'PRODUCTS_DELETE':
        handleProductDelete(payload, shop)
        break;
      // collection related
      case 'COLLECTIONS_CREATE':
        handleCreateCollection(payload, shop, admin)
        break;
      case 'COLLECTIONS_UPDATE':
        handleUpdateCollection(payload, shop, admin)
        break;
      case 'COLLECTIONS_DELETE':
        console.log("delete collections");
        handleDeleteCollection(payload, shop)
        break;
      // discount related
      case 'DISCOUNTS_CREATE':
        console.log("create discounts");
        break;
      case 'DISCOUNTS_UPDATE':
        console.log("update discounts");
        break;
      case 'DISCOUNTS_DELETE':
        console.log("delete discounts");
        break;
      default:
        throw new Error('Unhandled webhook topic: ' + topic);
    }

    return new Response();
  } catch (error: any) {
    console.error(`${new Date().toISOString()} - api.webhooks - Error:  `);
    console.error(error);
    return new Response('Internal server error', { status: 500 });
  }
};
