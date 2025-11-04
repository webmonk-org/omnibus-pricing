import { Link, InlineStack, Text, Tooltip, Icon, Box } from "@shopify/polaris"
import {
  QuestionCircleIcon
} from '@shopify/polaris-icons';

interface Props {
  label: string,
  tooltibContent: string,
  productsQuantity: number
  viewProductsParam?: string
  background: string
}

export default function ProductStatus({
  label,
  tooltibContent,
  productsQuantity,
  viewProductsParam,
  background
}: Props) {
  return (
    <Box paddingInline="300" background={background} padding="300">
      <InlineStack align="space-between">
        <InlineStack gap="150">
          <Text fontWeight="bold" as="span">{label.toUpperCase()}</Text>
          <Tooltip content={tooltibContent}>
            <Icon
              source={QuestionCircleIcon}
              tone="base"
            />
          </Tooltip>
        </InlineStack>
        {
          viewProductsParam && (
            <Link url={`/app/products?collectionHandle=${viewProductsParam}`} removeUnderline>
              View products
            </Link>
          )
        }
      </InlineStack>
      <InlineStack align="end">
        {/* NOTE: count the percentage value  */}
        <Text as="span">0%</Text>
      </InlineStack>
      <InlineStack>
        <Text as="span">
          {productsQuantity} products
        </Text>
      </InlineStack>
    </Box>
  )
}
