import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "app/shopify.server";
import { processVariants } from "app/utils/process-variants";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, admin, payload, session } = await authenticate.webhook(
    request,
  );

  if (!session || !admin) {
    return new Response();
  }

  if (topic !== "BULK_OPERATIONS_FINISH") {
    return new Response();
  }

  const bulkOpId = (payload as any).admin_graphql_api_id;

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
    { variables: { id: bulkOpId } },
  );

  const { data } = await result.json();
  const bulkOp = data.node;

  if (!bulkOp || bulkOp.status !== "COMPLETED" || !bulkOp.url) {
    console.log("Bulk op not ready or missing url", { shop, bulkOp });
    return new Response();
  }

  // Save the variants in DB
  processVariants(bulkOp.url, shop)

  console.log(`Processed bulk operation ${bulkOp.id} for ${shop}`);

  return new Response();
};
