import type { AdminApiContextWithoutRest } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients";

export async function triggerBulkOperation(
  admin: AdminApiContextWithoutRest,
  startDate: string,
  endDate: string
) {
  const mutation = `
  mutation {
    bulkOperationRunQuery(
      query: """
      {
        products(query: "published_status:published AND status:active") {
          edges {
            node {
              id
              handle
              tags
              status
              onlineStoreUrl
              createdAt
              priceRangeV2 {
                maxVariantPrice {
                  amount
                  currencyCode
                }
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              variants {
                edges {
                  node {
                    availableForSale
                    createdAt
                    price
                    compareAtPrice
                    displayName
                    id
                    legacyResourceId
                    taxCode
                    taxable
                  }
                }
              }
            }
          }
        }

        discountNodes(
          query: "((starts_at:>='${startDate}' AND starts_at<='${endDate}') OR
                   (ends_at:>='${startDate}' AND ends_at<='${endDate}') OR
                   status:active)"
        ) {
          edges {
            node {
              id
              discount {
                __typename

                ... on DiscountCodeBasic {
                  createdAt
                  startsAt
                  endsAt
                  status
                  title
                  summary
                  shortSummary
                  usageLimit
                  asyncUsageCount
                  codesCount { count }

                  customerGets {
                    items {
                      __typename
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
                    value {
                      __typename
                      ... on DiscountPercentage { percentage }
                      ... on DiscountAmount { amount { amount currencyCode } }
                    }
                  }

                  minimumRequirement {
                    ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity }
                  }
                }

                ... on DiscountAutomaticBasic {
                  createdAt
                  startsAt
                  endsAt
                  status
                  title
                  summary
                  shortSummary
                  asyncUsageCount

                  customerGets {
                    items {
                      __typename
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
                    value {
                      __typename
                      ... on DiscountPercentage { percentage }
                      ... on DiscountAmount { amount { amount currencyCode } }
                    }
                  }

                  minimumRequirement {
                    ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity }
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
  }`;

  const result = await admin.graphql(mutation);
  const json = await result.json();

  console.log("Bulk operation response:", JSON.stringify(json, null, 2));

  const op = json.data?.bulkOperationRunQuery;

  if (!op) {
    throw new Error("bulkOperationRunQuery returned null");
  }

  if (op.userErrors && op.userErrors.length > 0) {
    throw new Error(
      "Bulk operation userErrors: " + JSON.stringify(op.userErrors)
    );
  }

  return op.bulkOperation.status;
}
