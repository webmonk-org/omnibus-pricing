import type { AdminApiContextWithoutRest } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients";

const OMNIBUS_NAMESPACE = "omnibus_pricing";

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
        ownerType: "PRODUCT",
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
