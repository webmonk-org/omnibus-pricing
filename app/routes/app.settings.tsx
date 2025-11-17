import {
  Card,
  Layout,
  Page,
  Text,
  BlockStack,
  TextField,
  RadioButton,
  Button,
  InlineStack,
  Checkbox,
} from "@shopify/polaris";
import { useState, useCallback } from 'react';
import { TitleBar } from "@shopify/app-bridge-react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "app/shopify.server";
import db from "app/db.server"
import { DiscountSelector } from "app/components/discount-selector";
import type { DiscountItem } from "app/types";


export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { admin } = await authenticate.admin(request);

  const query = `
  query DiscountList($first: Int!, $after: String) {
    discountNodes(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          discount {
            __typename
            # Code discounts
            ... on DiscountCodeBasic {
              title
              startsAt
              endsAt
              codes(first: 5) { edges { node { code } } }
              combinesWith { orderDiscounts productDiscounts shippingDiscounts }
            }
            ... on DiscountCodeBxgy { title startsAt endsAt }
            ... on DiscountCodeFreeShipping { title startsAt endsAt }

            # Automatic discounts
            ... on DiscountAutomaticBasic { title startsAt endsAt }
            ... on DiscountAutomaticBxgy { title startsAt endsAt }
            ... on DiscountAutomaticFreeShipping { title startsAt endsAt }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

  const res = await admin.graphql(query, { variables: { first: 50 } });
  const data = await res.json();

  const items = data.data.discountNodes.edges.map(({ node }: any) => {
    const d = node.discount;
    const title = d.title ?? "Untitled";
    const startsAt = d.startsAt ?? null;
    const endsAt = d.endsAt ?? null;

    const code =
      d.__typename.startsWith("DiscountCode") &&
      d.codes?.edges?.[0]?.node?.code;

    return {
      id: node.id,
      title,
      subtitle: code ? `${code}` : undefined,
      startsAt,
      endsAt,
      type: d.__typename,
    };
  });

  return Response.json({ items, pageInfo: data.data.discountNodes.pageInfo });
};

export async function action({ request }: ActionFunctionArgs) {
  const { settings } = await request.json();

  const { session } = await authenticate.admin(request);

  await db.session.update({
    where: { id: session.id },
    data: { settings },
  });

  return new Response();
}

export default function Settings() {
  const { items } = useLoaderData<{ items: DiscountItem[]; pageInfo: any }>();
  console.log("Items are : ", items);

  const fetcher = useFetcher()
  const [priceTimeFrame, setPriceTimeFrame] = useState("30");
  const [compaignLength, setCompaignLength] = useState("60")
  const [discounts, setDiscounts] = useState("include")
  const [selectedDiscountIds, setSelectedDiscountIds] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);

  const handlePriceTimeFrameChange = useCallback((value: string) => {
    setPriceTimeFrame(value)
  }, [])

  const handleCompaignLengthChange = useCallback((value: string) => {
    setCompaignLength(value)
  }, [])

  const handleSelectChange = useCallback(
    (_: boolean, newValue: string) => {
      console.log("new value is :", newValue);
      setDiscounts(newValue)
    },
    [],
  );

  const handleCheckboxChange = useCallback(
    (newChecked: boolean) => setChecked(newChecked),
    [],
  );

  const submitSettings = () => {
    const payload = {
      timeframe: Number(priceTimeFrame),
      campaignLength: Number(compaignLength),
      discounts,
      selectedDiscountIds,
      multiCurrency: checked
    };

    console.log("Payload is :", payload);

    fetcher.submit({
      settings: JSON.stringify(payload),
    }, {
      method: "POST",
      encType: "application/json",
    });
  }

  const loading = ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  return (
    <Page>
      <TitleBar title="Settings Page" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Calculatation
                </Text>
                <TextField
                  value={priceTimeFrame}
                  onChange={handlePriceTimeFrameChange}
                  label="Lowest price calculation timeframe"
                  type="number"
                  autoComplete="timeframe"
                  helpText={
                    <span>
                      The lowest prior price will be calculated as the lowest price 30 days prior to discount.
                    </span>
                  }
                />

                <TextField
                  value={compaignLength}
                  onChange={handleCompaignLengthChange}
                  label="Max campaign length"
                  type="number"
                  autoComplete="compaign"
                  helpText={
                    <span>
                      The maximum allowed campaign length in your country
                    </span>
                  }
                />
                <BlockStack>
                  <Text as="h2" variant="headingMd">Enable Market Multi-Currency</Text>
                  <Checkbox label="enableMultiCurrency" checked={checked} onChange={handleCheckboxChange} />
                </BlockStack>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Discounts included in calculations
                </Text>
                <RadioButton
                  label="Include selected discounts"
                  helpText="Only selected discounts will be included in calculations."
                  checked={discounts === 'include'}
                  id="include"
                  name="discounts"
                  onChange={handleSelectChange}
                />
                <RadioButton
                  label="Exclude selected discounts"
                  helpText="All discounts except selected will be included in calculations."
                  id="exclude"
                  name="discounts"
                  checked={discounts === 'exclude'}
                  onChange={handleSelectChange}
                />
                <DiscountSelector
                  items={items}
                  value={selectedDiscountIds}
                  onChange={setSelectedDiscountIds}
                />
              </BlockStack>
            </Card>
            <InlineStack align="start">
              <Button variant="primary"
                onClick={submitSettings}
                loading={loading}
              >
                Save changes
              </Button>
            </InlineStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
