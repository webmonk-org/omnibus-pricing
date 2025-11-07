import type { AdminApiContextWithoutRest } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients";

export async function triggerBulkOperation(admin: AdminApiContextWithoutRest) {
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
