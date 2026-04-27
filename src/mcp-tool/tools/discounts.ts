import { z } from 'zod';
import { McpTool } from '../types';

const idArray = z.array(z.number()).optional();

const discountRuleCustomSchema = z.object({
  name: z.string().describe('Rule name, e.g. customer_limit_used, time_range, shipping_max_apply_value'),
  value: z.string().describe('Rule value. Haravan stores custom rule values as strings.'),
});

const promotionVariantSchema = z.object({
  product_id: z.number().describe('Product ID'),
  variant_id: z.number().describe('Variant ID'),
});

const baseDiscountSchema = z.object({
  starts_at: z.string().optional().describe('Start time in ISO 8601 format'),
  ends_at: z.string().nullable().optional().describe('End time in ISO 8601 format'),
  discount_type: z
    .enum(['fixed_amount', 'percentage', 'same_price'])
    .optional()
    .describe('Discount type: fixed amount, percentage, or same price'),
  value: z.number().optional().describe('Discount value. Percentage if discount_type=percentage.'),
  take_type: z
    .enum(['fixed_amount', 'percentage'])
    .optional()
    .describe('Take type used by newer discount rules'),
  applies_to_resource: z
    .enum(['product', 'collection', 'product_variant', 'group_customer'])
    .nullable()
    .optional()
    .describe('Resource the discount applies to; null means all orders'),
  applies_to_quantity: z.number().optional().describe('Minimum item quantity required'),
  applies_to_id: z.number().nullable().optional().describe('Legacy applied resource ID'),
  minimum_order_amount: z.number().nullable().optional().describe('Minimum order amount required'),
  order_over: z.number().nullable().optional().describe('Minimum order amount required by newer rules'),
  promotion_apply_type: z
    .union([z.literal(0), z.literal(1), z.literal(2)])
    .optional()
    .describe('0 = no prerequisite, 1 = minimum item quantity, 2 = minimum order amount'),
  variants: z.array(promotionVariantSchema).optional().describe('Applied product/variant pairs'),
  usage_limit: z.number().nullable().optional().describe('Total usage limit'),
  once_per_customer: z.boolean().optional().describe('Limit to one use per customer'),
  max_amount_apply: z.number().nullable().optional().describe('Maximum discount amount applied'),
  products_selection: z
    .enum(['all', 'collection_prerequisite', 'variant_prerequisite', 'product_prerequisite'])
    .optional(),
  customers_selection: z
    .enum(['all', 'customersegment_prerequisite', 'customer_prerequisite'])
    .optional(),
  provinces_selection: z.enum(['all', 'province_prerequisite']).optional(),
  channels_selection: z.enum(['all', 'channel_prerequisite']).optional(),
  locations_selection: z.enum(['all', 'location_prerequisite']).optional(),
  entitled_collection_ids: idArray,
  entitled_product_ids: idArray,
  entitled_variant_ids: idArray,
  entitled_customer_ids: idArray,
  entitled_customer_segment_ids: idArray,
  entitled_province_ids: idArray,
  entitled_channels: z.array(z.string()).optional().describe('Allowed channels, e.g. pos, web, harasocial'),
  entitled_location_ids: idArray,
  rule_customs: z.array(discountRuleCustomSchema).optional(),
});

const discountSchema = baseDiscountSchema.extend({
  code: z.string().describe('Discount/coupon code'),
  applies_once: z.boolean().optional().describe('Apply discount once per order'),
  is_promotion: z.boolean().optional().describe('Whether the discount code is treated as a promotion'),
  is_new_coupon: z.boolean().optional(),
  channel: z.string().nullable().optional(),
  location_ids: idArray,
});

const promotionSchema = baseDiscountSchema.extend({
  name: z.string().describe('Promotion name'),
});

export const discountTools: McpTool[] = [
  {
    name: 'haravan_discounts_list',
    project: 'discounts',
    description:
      'List discount codes/coupons. Filter by code and paginate. Use this for master discount data, not order-level discount usage.',
    schema: z.object({
      page: z.number().optional().describe('Page number (default: 1)'),
      limit: z.number().optional().describe('Results per page (default: 50)'),
      since_id: z.number().optional().describe('Restrict results to IDs after this value'),
      code: z.string().optional().describe('Filter by discount code'),
    }),
    httpMethod: 'GET',
    path: '/com/discounts.json',
    scopes: ['com.read_discounts'],
  },
  {
    name: 'haravan_discounts_create',
    project: 'discounts',
    description:
      'Create a discount code/coupon. Use carefully: this writes discount configuration in Haravan.',
    schema: z.object({
      discount: discountSchema.describe('Discount code object'),
    }),
    httpMethod: 'POST',
    path: '/com/discounts.json',
    scopes: ['com.write_discounts'],
    access: 'write',
  },
  {
    name: 'haravan_promotions_list',
    project: 'discounts',
    description:
      'List enabled promotions. Supports pagination and optional code filter according to Haravan promotion API docs.',
    schema: z.object({
      page: z.number().optional().describe('Page number (default: 1)'),
      limit: z.number().optional().describe('Results per page (default: 50)'),
      since_id: z.number().optional().describe('Restrict results to IDs after this value'),
      code: z.string().optional().describe('Filter by promotion code/name where supported'),
    }),
    httpMethod: 'GET',
    path: '/com/promotions.json',
    scopes: ['com.read_discounts'],
  },
  {
    name: 'haravan_promotions_get',
    project: 'discounts',
    description: 'Get a single promotion by ID, including targeting rules and eligibility constraints.',
    schema: z.object({
      promotion_id: z.number().describe('Promotion ID'),
    }),
    httpMethod: 'GET',
    path: '/com/promotions/{promotion_id}.json',
    scopes: ['com.read_discounts'],
  },
  {
    name: 'haravan_promotions_create',
    project: 'discounts',
    description:
      'Create a promotion. Use carefully: this writes discount/promotion configuration in Haravan.',
    schema: z.object({
      promotion: promotionSchema.describe('Promotion object'),
    }),
    httpMethod: 'POST',
    path: '/com/promotions.json',
    scopes: ['com.write_discounts'],
    access: 'write',
  },
  {
    name: 'haravan_promotions_enable',
    project: 'discounts',
    description: 'Enable a promotion by ID. Haravan uses the /com/discounts/{id}/enable.json endpoint.',
    schema: z.object({
      promotion_id: z.number().describe('Promotion ID'),
    }),
    httpMethod: 'PUT',
    path: '/com/discounts/{promotion_id}/enable.json',
    scopes: ['com.write_discounts'],
    access: 'write',
  },
  {
    name: 'haravan_promotions_disable',
    project: 'discounts',
    description: 'Disable a promotion by ID. Haravan uses the /com/discounts/{id}/disable.json endpoint.',
    schema: z.object({
      promotion_id: z.number().describe('Promotion ID'),
    }),
    httpMethod: 'PUT',
    path: '/com/discounts/{promotion_id}/disable.json',
    scopes: ['com.write_discounts'],
    access: 'write',
  },
  {
    name: 'haravan_promotions_delete',
    project: 'discounts',
    description: 'Delete a promotion by ID. Use carefully: this removes promotion configuration.',
    schema: z.object({
      promotion_id: z.number().describe('Promotion ID'),
    }),
    httpMethod: 'DELETE',
    path: '/com/promotions/{promotion_id}.json',
    scopes: ['com.write_discounts'],
    access: 'write',
  },
];
