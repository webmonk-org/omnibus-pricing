import type { AdminApiContextWithoutRest } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients";

export async function triggerBulkOperation(admin: AdminApiContextWithoutRest) {
  const mutation = `
mutation {
  bulkOperationRunQuery(
    query: """
    {
      products(first: 250) {
        edges {
          node {
            id
            handle
            status
            variants(first: 250) {
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

      discountNodes(first: 250) {
        edges {
          node {
            id
            discount {
              __typename

              # Only the types you care about
              ... on DiscountCodeBasic {
                title
                summary
                status
                startsAt
                endsAt
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
                        edges {
                          node {
                            id
                          }
                        }
                      }
                    }
                    ... on DiscountCollections {
                      collections(first: 250) {
                        edges {
                          node {
                            id
                          }
                        }
                      }
                    }
                  }
                }
              }

              ... on DiscountAutomaticBasic {
                title
                summary
                status
                startsAt
                endsAt
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
                        edges {
                          node {
                            id
                          }
                        }
                      }
                    }
                    ... on DiscountCollections {
                      collections(first: 250) {
                        edges {
                          node {
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
  console.log("Data is : ", data);
  return data.bulkOperationRunQuery.bulkOperation.status;
}
