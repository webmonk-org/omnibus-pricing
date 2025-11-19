import type { AdminApiContextWithoutRest } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients";

export async function triggerBulkOperation(admin: AdminApiContextWithoutRest) {

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

                    legacyMetafields: metafields(namespace: "omnibus") {
                      edges {
                        node {
                          id
                          value
                          key
                          namespace
                        }
                      }
                    }

                    appMetafields: metafields(namespace: "$app:omnibus") {
                      edges {
                        node {
                          id
                          value
                          key
                          namespace
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
  }`

  const result = await admin.graphql(mutation);
  const { data } = await result.json();
  return data.bulkOperationRunQuery.bulkOperation.status;
}
