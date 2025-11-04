import { BlockStack, Box } from "@shopify/polaris"
import {
  QuestionCircleIcon
} from '@shopify/polaris-icons';

interface Props {
  lable: string,
  tooltibContent: string,
  products: number
  viewProductsParam: string
}

export function ProductStatus({
  lable,
  tooltibContent,
  products,
  viewProductsParam
}: Props) {
  return (
    <Box>
      <BlockStack>
        <QuestionCircleIcon />
      </BlockStack>
    </Box>
  )
}
