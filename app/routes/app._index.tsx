import { useCallback, useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
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
  Icon,
  Modal,
  Banner,
  SkeletonBodyText,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import ProductStatus from "app/components/product-status";
import { ReviewBanner } from "app/components/review-banner";
import { QuestionCircleIcon } from "@shopify/polaris-icons";
import db from "app/db.server"
import { DEFAULT_SETTINGS, type ComplianceKey, type Settings } from "app/types";



export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const dbSession = await db.session.findFirst({
    where: { shop: session.shop },
    select: {
      calculationInProgress: true,
      settings: true,
    }
  });

  let settings = (dbSession?.settings ?? null) as Settings | null

  // Set default settings
  if (!dbSession?.settings) {
    settings = DEFAULT_SETTINGS;
    await db.session.update({
      where: {
        id: session.id,
      },
      data: {
        settings: JSON.stringify(settings)
      }
    })
  }


  const statsRaw = await db.variant.groupBy({
    where: {
      shop: session.shop,
    },
    by: ["complianceStatus"],
    _count: {
      _all: true,
    },
  });


  // Build a stable object with default 0s
  const complianceStats: Record<ComplianceKey, number> = {
    compliant: 0,
    non_compliant: 0,
    not_on_sale: 0,
    not_enough_data: 0,
  };

  for (const row of statsRaw) {
    const key = row.complianceStatus as ComplianceKey | null;
    if (key && key in complianceStats) {
      complianceStats[key] = row._count._all;
    }
  }
  console.log("complianceStats:", complianceStats);

  const parsed: Settings =
    typeof dbSession?.settings === "string"
      ? JSON.parse(dbSession?.settings)
      : dbSession?.settings;

  const timeframeDays = parsed.timeframe ?? 30;
  const since = new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000);

  const recordsPerVariant = await db.priceHistory.groupBy({
    by: ['variantId'],
    where: { date: { gte: since } },
    _count: { id: true },
  });

  const daysCollected = Math.min(
    ...recordsPerVariant.map((row) => row._count.id),
  );

  // This would return 2 for your current data
  console.log(`${daysCollected} / ${timeframeDays} days collected`);

  return Response.json({
    calculationInProgress: dbSession?.calculationInProgress,
    complianceStats,
    daysCollected,
    timeframeDays
  });
};

export default function Index() {
  const { calculationInProgress, complianceStats, daysCollected, timeframeDays } = useLoaderData<typeof loader>();
  // const fetcher = useFetcher();

  // const summaryFetcher = useFetcher()

  const [dispayBanner, setDisplayBanner] = useState(true);
  const [active, setActive] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [refreshing, setRefreshing] = useState(false);

  const handleChange = useCallback(() => setActive(!active), [active]);

  // const laodingSummary = ["loading", "submitting"].includes(summaryFetcher.state) &&
  //   summaryFetcher.formMethod === "GET";

  // const refreshing =
  //   ["loading", "submitting"].includes(fetcher.state) &&
  //   fetcher.formMethod === "POST";

  const handleRefresh = async () => {
    setRefreshing(true)
    // fetcher.submit({}, { method: "POST", action: "/api/products" });
    //  give React a chance to render
    await new Promise(resolve => setTimeout(resolve, 100));

    // simulate async fetch
    console.log("Fetching...");
    await new Promise(resolve => setTimeout(resolve, 4000));
    console.log("Done fetching!");

    setRefreshing(false)


    // const { data } = fetcher
    //
    // console.log("Products: ", data)

    console.log("Refresh data!")
  };

  // change this later
  const now = new Date();
  const m = now.toLocaleString("en-US", { month: "short" });
  const d = now.getDay();
  const timeString = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const activator = (<div
    onMouseEnter={() => setHovered(true)}
    onMouseLeave={() => setHovered(false)}
    onClick={handleChange}
  >
    <Icon source={QuestionCircleIcon} tone={hovered ? "base" : "subdued"} />
  </div>)

  return (
    <Page>
      <TitleBar title="Omnibus Pricing" />
      <Box width="full" borderColor="border-brand" paddingBlock="500">
        <InlineStack align="end">
          <InlineStack blockAlign="baseline" gap="300">
            <Tooltip content={`${m} ${d}, 2025, ${timeString}`}>
              <Text as="span">Latest update: {timeString}</Text>
            </Tooltip>
            <Button onClick={handleRefresh} loading={refreshing || calculationInProgress}>
              Refersh Data
            </Button>

            <Modal
              open={active}
              activator={activator}
              onClose={handleChange}
              title="Refreshing data"
              primaryAction={{
                content: 'Got it!',
                onAction: handleChange,
              }}
            >
              <Modal.Section>
                <Text as="p">
                  By default, Omnibus status, price history, etc. are calculated once per day. However, if you make changes to products' prices, it is advised to run refresh to get the most recent data available. The process might take up to 60 mins with a large amount of products. Refresh the page to view updated data once the process has finished.
                </Text>
              </Modal.Section>
            </Modal>
          </InlineStack>
        </InlineStack>
      </Box>
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {
              calculationInProgress && (
                <Banner title="Running calculations" onDismiss={() => { }}>
                  <p>
                    The process to get your current product prices, coupons and sales history should not take more than 10 - 60 minutes, depending on the amount of products in your store. Lowest price information will be available once the process has finished.
                  </p>
                </Banner>
              )
            }
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  💡 Getting started
                </Text>
                <Text as="p">
                  In order to display the 30-day lowest price on your storefront
                  you have to customize your theme with our code snippet. Our
                  theme extension makes it fast and easy!
                </Text>

                <Text as="p">Just follow three simple steps:</Text>

                <Text as="p">
                  Step 1. Add our theme extension or snippet using our
                  easy-to-follow guide
                </Text>

                <Text as="p">
                  Step 2. Configure the theme extension to show the label in
                  your language. If your storefront is available in multiple
                  languages add label translations for all languages
                </Text>
                <Text as="p">
                  Step 3. If your local law requires longer than 30-day period,
                  you can adjust it in the Settings
                </Text>
                <Text as="p">
                  Voila! Your Omnibus Price will now be proudly displayed on
                  your storefront once your products are discounted.
                </Text>

                <BlockStack gap="200">
                  <Text as="p">
                    If you need assistance with the installation, just send us a
                    message. We're happy to help!
                  </Text>
                  <InlineStack gap="300">
                    <Button
                      variant="primary"
                      loading={refreshing}
                      onClick={handleRefresh}
                    >
                      I need help with the theme installation
                    </Button>
                    <Button>Go to help center</Button>
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
                  Thank you for choosing Omnibus Pricing! We will help keep your
                  discounted product prices inline with the EU Omnibus
                  Directive.
                </Text>
                <Text as="p">
                  EU Omnibus directive requires that retailers show the 30-day
                  lowest price prior to a discount. On this overview page you
                  can see the current state of your Omnibus compliancy.
                </Text>

                <Text as="p">
                  You can see a detailed view of your products Pricing info in
                  the “Product” -tab. The app provides you with the 30-day
                  lowest price prior to discount for all active products.
                  Non-compliant products can be fixed by setting Compare at
                  price to the prior lowest price or by removing the Compare at
                  price.
                </Text>

                <Text variant="bodyMd" as="p">
                  If you have any feedback or questions, do not hesitate to send
                  us a message via the in-app chat!
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text fontWeight="bold" as="h2" variant="headingMd">
                    Summary
                  </Text>
                  {
                    // NOTE: change this to listen to fetching summary loading state
                    !refreshing ? (
                      <SkeletonBodyText lines={1} />
                    ) : (
                      <Link url="/app/products" removeUnderline>
                        View All Products
                      </Link>
                    )
                  }
                </BlockStack>
                <BlockStack>
                  <ProductStatus
                    label="Not compliant"
                    tooltibContent="The compare at price is higher than the lowest prior price which means that the marketed discount is too high and thus not compliant."
                    background=""
                    productsQuantity={complianceStats?.non_compliant}
                    loading={false}
                  />
                  <ProductStatus
                    label="Compliant"
                    tooltibContent="The compare at price is lower than or equal to the lowest prior price which means that the price is Omnibus compliant."
                    background="bg-fill-active"
                    productsQuantity={complianceStats?.compliant}
                    loading={false}
                  />
                  <ProductStatus
                    label="Not discounted"
                    tooltibContent="The Omnibus directive only applies to discounts."
                    background=""
                    productsQuantity={complianceStats?.not_on_sale}
                    viewProductsParam="omnibus-label-omnibus-not-on-sale"
                    loading={false}
                  />
                </BlockStack>
              </BlockStack>
            </Card>
            {dispayBanner && (
              <ReviewBanner
                title="How is your experience with Omnibus Pricing"
                description="Click below to rate us on the Shopify App Store"
                onReview={(rating) => {
                  console.log(`Rating: ${rating}`);
                  // Record analytics
                }}
                onClose={() => {
                  // Handle the close action here
                  console.log("Review banner closed");
                  setDisplayBanner(false);
                }}
              />
            )}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" fontWeight="semibold" as="h3">
                  Price history information
                </Text>
                <Text variant="bodyMd" as="p">
                  {daysCollected} / {timeframeDays} days collected
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Until we have the full price history, compliancy cannot be
                  ensured. You can show the lowest price on your storefront,
                  however, it may not be accurate.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page >
  );
}
