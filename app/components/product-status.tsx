import { Link, InlineStack, Text, Tooltip, Icon, Box, SkeletonBodyText } from "@shopify/polaris"
import {
  QuestionCircleIcon
} from '@shopify/polaris-icons';

interface Props {
  label: string
  tooltibContent: string
  productsQuantity: number | null
  viewProductsParam?: string
  loading: boolean
  background: string
}

export default function ProductStatus({
  label,
  tooltibContent,
  productsQuantity,
  viewProductsParam,
  loading = true,
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
              tone="subdued"
            />
          </Tooltip>
        </InlineStack>
        {
          viewProductsParam && !loading && (
            <Link url={`/app/products?collectionHandle=${viewProductsParam}`} removeUnderline>
              View products
            </Link>
          )
        }
      </InlineStack>

      {
        loading ? (
          <SkeletonBodyText lines={2} />
        ) : (

          <>
            <InlineStack>
              <Text as="span">
                {productsQuantity || 0} products
              </Text>
            </InlineStack>
            <InlineStack align="end">
              {/* NOTE: count the percentage value  */}
              <Text as="span">0%</Text>
            </InlineStack>
          </>
        )
      }
    </Box>
  )
}
