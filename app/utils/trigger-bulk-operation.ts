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
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                        }
                      }
                    }
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                      ... on DiscountProducts {
                        products(first: 250) {
                          nodes {
                            id
                          }
                        }
                      }
                      ... on DiscountCollections {
                        collections(first: 250) {
                          nodes {
                            id
                          }
                        }
                      }
                    }
                  }
                }

                ... on DiscountAutomaticBasic {
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                        }
                      }
                    }
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                      ... on DiscountProducts {
                        products(first: 250) {
                          nodes {
                            id
                          }
                        }
                      }
                      ... on DiscountCollections {
                        collections(first: 250) {
                          nodes {
                            id
                          }
                        }
                      }
                    }
                  }
                }

                ... on DiscountCodeBxgy {
                  customerGets {
                    value {
                      # BXGY usually expresses value as a percentage, so we read it if present
                      ... on DiscountPercentage {
                        percentage
                      }
                    }
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                      ... on DiscountProducts {
                        products(first: 250) {
                          nodes {
                            id
                          }
                        }
                      }
                      ... on DiscountCollections {
                        collections(first: 250) {
                          nodes {
                            id
                          }
                        }
                      }
                    }
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
