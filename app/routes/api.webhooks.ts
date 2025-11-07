import type { ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from 'app/shopify.server';
import { bulkOpFinish, scopesUpdate, uninstalled } from 'app/utils/webhooks-handler';

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

    console.log('------------------ Webhook Received ------------------');
    console.log('webhookId: ', webhookId);
    console.log('topic: ', topic);
    console.log('shop: ', shop);
    console.log('payload: ', JSON.stringify(payload));
    console.log('------------------------------------------------------');

    if (!session) {
      return new Response();
    }

    switch (topic) {
      case 'APP_UNINSTALLED':
        await uninstalled(shop);
        break;
      case 'BULK_OPERATIONS_FINISH':
        await bulkOpFinish(admin, payload, shop, session)
        break;
      case 'APP_SCOPES_UPDATE':
        await scopesUpdate(payload, session);
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
