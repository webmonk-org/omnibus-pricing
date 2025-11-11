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
                handle
                status
                variants {
                  edges {
                    node {
                      id
                      title
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
                handle
                products {
                  edges {
                    node {
                      id
                    }
                  }
                }
              }
            }
          }

          discountNodes {
            edges {
              node {
                id
                discount {
                  __typename
                  ... on DiscountCodeBasic {
                    title
                    summary
                    status
                    startsAt
                    endsAt
                  }
                  ... on DiscountAutomaticBasic {
                    title
                    summary
                    status
                    startsAt
                    endsAt
                  }
                  ... on DiscountCodeBxgy {
                    title
                    summary
                    status
                    startsAt
                    endsAt
                  }
                }
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
  `

  const result = await admin.graphql(mutation);
  const { data } = await result.json();
  return await waitForBulkOperationCompletion(admin, data.bulkOperationRunQuery.bulkOperation.id)

}

async function waitForBulkOperationCompletion(admin: AdminApiContextWithoutRest, bulkOpId: string) {
  while (true) {
    const response = await admin.graphql(
      `#graphql
        query getBulkOp($id: ID!) {
          node(id: $id) {
            ... on BulkOperation {
              id
              status
              errorCode
              url
              objectCount
            }
          }
        }
      `,
      { variables: { id: bulkOpId } },
    );

    const result = await response.json();
    const op = result.data.node;

    console.log("Bulk op status:", op.status);

    if (op.status === "COMPLETED") return op;
    if (op.status === "FAILED" || op.errorCode) throw new Error(`Bulk op failed: ${op.errorCode}`);

    await new Promise((resolve) => setTimeout(resolve, 2000)); // wait 2s and poll again
  }
}
