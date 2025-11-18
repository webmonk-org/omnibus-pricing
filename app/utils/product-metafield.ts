import type { OmnibusPriceHistoryMetafield, OmnibusSummaryMetafield } from "app/types";
import type { AdminApiContextWithoutRest } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients";

const OMNIBUS_NAMESPACE = "$app:omnibus";

const productMetafieldDefinitions = [
  {
    name: "Omnibus summary",
    key: "summary",
    description: "Current omnibus price, lowest prior price and status.",
    type: "json",
  },
  {
    name: "Omnibus price history",
    key: "price_history",
    description: "Recent price changes used for omnibus pricing.",
    type: "json",
  },
];

export async function createProductMetafieldDefinitions(
  admin: AdminApiContextWithoutRest
) {
  const mutation = `
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
          namespace
          key
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  for (const def of productMetafieldDefinitions) {
    const variables = {
      definition: {
        name: def.name,
        namespace: OMNIBUS_NAMESPACE,
        key: def.key,
        description: def.description,
        type: def.type,
        ownerType: "PRODUCTVARIANT",
        access: {
          admin: "MERCHANT_READ_WRITE",
          storefront: "PUBLIC_READ",
        },
      },
    };

    try {
      const res = await admin.graphql(mutation, { variables });
      const json = await res.json();

      const errors = json.data?.metafieldDefinitionCreate?.userErrors;
      if (errors?.length) {
        // If it's "KEY_TAKEN" or similar, you can safely ignore.
        const code = errors[0].code;
        if (code !== "KEY_TAKEN") {
          console.error(
            "Failed to create metafield definition",
            def.key,
            errors
          );
        }
      } else {
        const created =
          json.data?.metafieldDefinitionCreate?.createdDefinition;
        console.log("Created metafield definition", created);
      }
    } catch (err) {
      console.error(
        "Error while ensuring metafield definition",
        def.key,
        err
      );
    }
  }
}


export async function setOmnibusMetafieldsForVariant(opts: {
  admin: AdminApiContextWithoutRest;
  variantGid: string;
  summary: OmnibusSummaryMetafield;
  history: OmnibusPriceHistoryMetafield;
}) {
  const { admin, variantGid, summary, history } = opts;

  const mutation = `
    mutation SetOmnibusMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          key
          namespace
          owner {
            ... on ProductVariant { id }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const variables = {
    metafields: [
      {
        ownerId: variantGid,
        namespace: OMNIBUS_NAMESPACE,
        key: "summary",
        type: "json",
        value: JSON.stringify(summary),
      },
      {
        ownerId: variantGid,
        namespace: OMNIBUS_NAMESPACE,
        key: "price_history",
        type: "json",
        value: JSON.stringify(history),
      },
    ],
  };

  const res = await admin.graphql(mutation, { variables });
  const json = await res.json();

  const errors = json.data?.metafieldsSet?.userErrors;
  if (errors?.length) {
    console.error(
      "Failed to set omnibus metafields for variant",
      variantGid,
      errors,
    );
  }
}
