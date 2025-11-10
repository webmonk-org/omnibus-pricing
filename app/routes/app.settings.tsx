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
} from "@shopify/polaris";
import { useState, useCallback } from 'react';
import { TitleBar } from "@shopify/app-bridge-react";
import { useFetcher } from "@remix-run/react";

export default function Settings() {
  const fetcher = useFetcher()
  const [priceTimeFrame, setPriceTimeFrame] = useState("30");
  const [compaignLength, setCompaignLength] = useState("60")
  const [discounts, setDiscounts] = useState("include")

  const handlePriceTimeFrameChange = useCallback((value: string) => {
    setPriceTimeFrame(value)
  }, [])

  const handleCompaignLengthChange = useCallback((value: string) => {
    setCompaignLength(value)
  }, [])

  const handleSelectChange = useCallback(
    (_: boolean, newValue: string) => setDiscounts(newValue),
    [],
  );


  const submitSettings = () => {

  }

  // todo: consum settings
  fetcher.submit({
    data: JSON.stringify({
      timeframe: priceTimeFrame,
      compaignLength,
      discounts
    })
  }, { method: "POST", action: "/api/..." });

  return (
    <Page>
      <TitleBar title="Additional page" />
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
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Discounts included in calculations
                </Text>
                <RadioButton
                  label="Accounts are disabled"
                  helpText="Customers will only be able to check out as guests."
                  checked={discounts === 'include'}
                  id="disabled"
                  name="discounts"
                  onChange={handleSelectChange}
                />
                <RadioButton
                  label="Accounts are optional"
                  helpText="Customers will be able to check out with a customer account or as a guest."
                  id="optional"
                  name="discounts"
                  checked={discounts === 'exclude'}
                  onChange={handleSelectChange}
                />
              </BlockStack>
            </Card>
            <InlineStack align="start">
              <Button variant="primary"
                onClick={submitSettings}
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
