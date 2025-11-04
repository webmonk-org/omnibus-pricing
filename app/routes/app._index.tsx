import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  Link,
  InlineStack,
  Tooltip,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import ProductStatus from "app/components/product-status";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );
  const responseJson = await response.json();

  const product = responseJson.data!.productCreate!.product!;
  const variantId = product.variants.edges[0]!.node!.id!;

  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyRemixTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );

  const variantResponseJson = await variantResponse.json();

  return {
    product: responseJson!.data!.productCreate!.product,
    variant:
      variantResponseJson!.data!.productVariantsBulkUpdate!.productVariants,
  };
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();

  const shopify = useAppBridge();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";
  const productId = fetcher.data?.product?.id.replace(
    "gid://shopify/Product/",
    "",
  );

  useEffect(() => {
    if (productId) {
      shopify.toast.show("Product created");
    }
  }, [productId, shopify]);
  const refreshData = () => {
    // fetcher.submit({}, { method: "POST" });
    // TODO:  refreshing data
  }

  // change this later
  const now = new Date();
  const m = now.toLocaleString('en-US', { month: 'short' });
  const d = now.getDay()
  const timeString = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    <Page>
      <TitleBar title="Omnibus Pricing" />
      <Box width="full" borderColor="border-brand" padding="300">
        <InlineStack align="end" gap="200">
          <Tooltip content={`${m} ${d}, 2025, ${timeString}`}>
            <Text as="span">
              Latest update: {timeString}
            </Text>
          </Tooltip>
          <Button onClick={refreshData}>
            Refersh Data
          </Button>
        </InlineStack>
      </Box>
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  💡 Getting started
                </Text>
                <Text as="p">
                  In order to display the 30-day lowest price on your storefront you have to customize your theme with our code snippet. Our theme extension makes it fast and easy!
                </Text>

                <Text as="p">
                  Just follow three simple steps:
                </Text>

                <Text as="p">
                  Step 1. Add our theme extension or snippet using our easy-to-follow guide
                </Text>

                <Text as="p">
                  Step 2. Configure the theme extension to show the label in your language. If your storefront is available in multiple languages add label translations for all languages
                </Text>
                <Text as="p">
                  Step 3. If your local law requires longer than 30-day period, you can adjust it in the Settings
                </Text>
                <Text as="p">
                  Voila! Your Omnibus Price will now be proudly displayed on your storefront once your products are discounted.
                </Text>

                <BlockStack gap="200">
                  <Text as="p">
                    If you need assistance with the installation, just send us a message. We're happy to help!
                  </Text>
                  <InlineStack gap="300">
                    <Button variant="primary" loading={isLoading} onClick={refreshData}>
                      I need help with the theme installation
                    </Button>
                    <Button>
                      Go to help center
                    </Button>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  👋 Welcome
                </Text>
                <Text as="p">
                  Thank you for choosing Sniffie: Omnibus Pricing! We will help keep your discounted product prices inline with the EU Omnibus Directive.
                </Text>
                <Text as="p">
                  EU Omnibus directive requires that retailers show the 30-day lowest price prior to a discount. On this overview page you can see the current state of your Omnibus compliancy.
                </Text>

                <Text as="p">
                  You can see a detailed view of your products Pricing info in the “Product” -tab. The app provides you with the 30-day lowest price prior to discount for all active products. Non-compliant products can be fixed by setting Compare at price to the prior lowest price or by removing the Compare at price.
                </Text>

                <Text variant="bodyMd" as="p">
                  If you have any feedback or questions, do not hesitate to send us a message via the in-app chat!
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text fontWeight="bold" as="h2" variant="headingMd">
                    Summary
                  </Text>
                  <Link url="/app/products" removeUnderline>
                    View All Products
                  </Link>
                </BlockStack>
                <BlockStack>
                  <ProductStatus
                    label="Not compliant"
                    tooltibContent="The compare at price is higher than the lowest prior price which means that the marketed discount is too high and thus not compliant."
                    background=""
                    productsQuantity={0}
                  />
                  <ProductStatus
                    label="Compliant"
                    tooltibContent="The compare at price is higher than the lowest prior price which means that the marketed discount is too high and thus not compliant."
                    background="bg-fill-active"
                    productsQuantity={0}
                  />
                  <ProductStatus
                    label="Not discounted"
                    tooltibContent="The compare at price is higher than the lowest prior price which means that the marketed discount is too high and thus not compliant."
                    background=""
                    productsQuantity={30}
                    viewProductsParam="omnibus-label-omnibus-not-on-sale"
                  />
                </BlockStack>
              </BlockStack>

            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
