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


export async function bulkOpFinish(admin: AdminApiContextWithoutRest, payload: any, shop: string, session: SessionData) {
  const bulkOpId = payload.admin_graphql_api_id;

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

  // set calculationInProgress to false
  updateCalculationInProgress(session, false);
}
