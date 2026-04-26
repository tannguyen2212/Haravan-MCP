import { z } from 'zod';
import { McpTool, MiddlewareContext } from '../../types';
import { clientFromCtx, fetchAll, ok, err, parseDate, sleep, stripEmpty } from './helpers';

interface ProductVariant {
  id: number;
  title?: string;
  sku?: string;
  barcode?: string;
  price?: string | number;
  inventory_quantity?: number;
}

interface Product {
  id: number;
  title: string;
  handle?: string;
  vendor?: string;
  product_type?: string;
  variants?: ProductVariant[];
}

interface InventoryLocation {
  product_id?: number;
  product_variant_id?: number;
  variant_id?: number;
  location_id: number;
  location_name?: string;
  qty_available?: number;
  qty_onhand?: number;
  available?: number;
  onhand?: number;
}

interface Location {
  id: number;
  name: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function matchesText(value: string | undefined, query: string): boolean {
  return !!value && value.toLowerCase().includes(query.toLowerCase());
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function normalizeInventoryLocation(raw: InventoryLocation, locationNameMap: Map<number, string>) {
  const qtyAvailable = raw.qty_available ?? raw.available ?? 0;
  const qtyOnhand = raw.qty_onhand ?? raw.onhand ?? qtyAvailable;
  return stripEmpty({
    location_id: raw.location_id,
    location_name: raw.location_name ?? locationNameMap.get(raw.location_id) ?? `Location ${raw.location_id}`,
    qty_available: qtyAvailable,
    qty_onhand: qtyOnhand,
  });
}

async function getLocationNameMap(client: ReturnType<typeof clientFromCtx>) {
  try {
    const resp = await client.get<any>('/com/locations.json', {});
    const locations: Location[] = resp.data?.locations ?? [];
    return new Map(locations.map((loc) => [loc.id, loc.name]));
  } catch {
    return new Map<number, string>();
  }
}

async function findProduct(ctx: MiddlewareContext): Promise<{ product: Product | null; matched_variant_id?: number; apiCalls: number }> {
  const { product_id, variant_id, sku, handle, product_query } = ctx.params as {
    product_id?: number;
    variant_id?: number;
    sku?: string;
    handle?: string;
    product_query?: string;
  };

  const client = clientFromCtx(ctx);

  if (product_id) {
    const resp = await client.get<any>(`/com/products/${product_id}.json`, {
      fields: 'id,title,handle,vendor,product_type,variants',
    });
    return { product: resp.data?.product ?? null, matched_variant_id: variant_id, apiCalls: 1 };
  }

  if (handle) {
    const { items, apiCalls } = await fetchAll<Product>(
      client,
      '/com/products.json',
      'products',
      { handle },
      { fields: 'id,title,handle,vendor,product_type,variants', maxPages: 1 }
    );
    const product = items[0] ?? null;
    return { product, matched_variant_id: variant_id, apiCalls };
  }

  if (variant_id) {
    const resp = await client.get<any>(`/com/variants/${variant_id}.json`, {
      fields: 'id,product_id,title,sku,barcode',
    });
    const variant = resp.data?.variant;
    if (!variant?.product_id) return { product: null, matched_variant_id: variant_id, apiCalls: 1 };
    const productResp = await client.get<any>(`/com/products/${variant.product_id}.json`, {
      fields: 'id,title,handle,vendor,product_type,variants',
    });
    return { product: productResp.data?.product ?? null, matched_variant_id: variant_id, apiCalls: 2 };
  }

  if (sku || product_query) {
    const query = sku ?? product_query ?? '';
    const { items, apiCalls } = await fetchAll<Product>(
      client,
      '/com/products.json',
      'products',
      {},
      { fields: 'id,title,handle,vendor,product_type,variants', maxPages: 10 }
    );

    const bySku = sku
      ? items.find((p) => (p.variants ?? []).some((v) => v.sku?.toLowerCase() === sku.toLowerCase()))
      : undefined;
    if (bySku) {
      const matched = (bySku.variants ?? []).find((v) => v.sku?.toLowerCase() === sku!.toLowerCase());
      return { product: bySku, matched_variant_id: matched?.id, apiCalls };
    }

    const byText = items.find(
      (p) =>
        matchesText(p.title, query) ||
        matchesText(p.handle, query) ||
        (p.variants ?? []).some((v) => matchesText(v.title, query) || matchesText(v.sku, query) || matchesText(v.barcode, query))
    );
    if (byText) {
      const matched = (byText.variants ?? []).find(
        (v) => matchesText(v.title, query) || matchesText(v.sku, query) || matchesText(v.barcode, query)
      );
      return { product: byText, matched_variant_id: matched?.id, apiCalls };
    }

    return { product: null, apiCalls };
  }

  return { product: null, apiCalls: 0 };
}

const productContextHandler = async (ctx: MiddlewareContext) => {
  try {
    const { include_recent_orders = true, days = 30, max_orders = 20 } = ctx.params as {
      include_recent_orders?: boolean;
      days?: number;
      max_orders?: number;
    };

    const client = clientFromCtx(ctx);
    let apiCalls = 0;

    const found = await findProduct(ctx);
    apiCalls += found.apiCalls;

    if (!found.product) {
      return ok({
        found: false,
        message: 'No matching product found. Provide product_id, variant_id, SKU, handle, or a more specific product_query.',
        reference: {
          lookup_params: stripEmpty(ctx.params),
        },
      });
    }

    const product = found.product;
    const variants = product.variants ?? [];
    const selectedVariantIds = found.matched_variant_id ? [found.matched_variant_id] : variants.map((v) => v.id).filter(Boolean);
    const selectedVariantSet = new Set(selectedVariantIds);

    const locationNameMap = await getLocationNameMap(client);
    apiCalls++;

    const inventoryByVariant = [] as any[];
    for (const variant of variants) {
      if (selectedVariantSet.size > 0 && !selectedVariantSet.has(variant.id)) continue;
      try {
        const resp = await client.get<any>('/com/inventories/locations.json', { variant_id: variant.id });
        apiCalls++;
        const locs: InventoryLocation[] = resp.data?.inventories ?? resp.data?.locations ?? [];
        const locations = locs.map((l) => normalizeInventoryLocation(l, locationNameMap)).filter(Boolean);
        inventoryByVariant.push(
          stripEmpty({
            variant_id: variant.id,
            variant_title: variant.title,
            sku: variant.sku,
            barcode: variant.barcode,
            total_qty_available: locations.reduce((s: number, l: any) => s + toNumber(l.qty_available), 0),
            total_qty_onhand: locations.reduce((s: number, l: any) => s + toNumber(l.qty_onhand), 0),
            locations,
          })
        );
        if (apiCalls % 20 === 0) await sleep(300);
      } catch {
        inventoryByVariant.push(
          stripEmpty({
            variant_id: variant.id,
            variant_title: variant.title,
            sku: variant.sku,
            inventory_error: 'Could not fetch inventory for this variant.',
          })
        );
      }
    }

    let recentOrders: any[] = [];
    let ordersAnalyzed = 0;
    if (include_recent_orders) {
      const createdAtMin = parseDate(undefined, days);
      const { items: orders, apiCalls: orderCalls } = await fetchAll<any>(
        client,
        '/com/orders.json',
        'orders',
        { created_at_min: createdAtMin, status: 'any' },
        {
          fields:
            'id,name,order_number,created_at,updated_at,financial_status,fulfillment_status,cancelled_status,source_name,location_id,user_id,assigned_location_id,customer,line_items,total_price',
          maxPages: 20,
        }
      );
      apiCalls += orderCalls;
      ordersAnalyzed = orders.length;

      recentOrders = orders
        .map((order) => {
          const matchingLineItems = (order.line_items ?? []).filter((li: any) => {
            const liProductId = toNumber(li.product_id, -1);
            const liVariantId = toNumber(li.variant_id, -1);
            return liProductId === product.id || selectedVariantSet.has(liVariantId);
          });
          if (matchingLineItems.length === 0) return null;
          return stripEmpty({
            order_id: order.id,
            order_name: order.name,
            order_number: order.order_number,
            created_at: order.created_at,
            updated_at: order.updated_at,
            financial_status: order.financial_status,
            fulfillment_status: order.fulfillment_status,
            cancelled_status: order.cancelled_status,
            source_name: order.source_name,
            location_id: order.location_id ?? order.assigned_location_id,
            location_name: order.location_id ? locationNameMap.get(order.location_id) : undefined,
            user_id: order.user_id,
            customer: order.customer
              ? stripEmpty({ id: order.customer.id, name: `${order.customer.first_name ?? ''} ${order.customer.last_name ?? ''}`.trim(), email: order.customer.email, phone: order.customer.phone })
              : undefined,
            matching_line_items: matchingLineItems.map((li: any) =>
              stripEmpty({
                line_item_id: li.id,
                product_id: li.product_id,
                variant_id: li.variant_id,
                title: li.title,
                variant_title: li.variant_title,
                sku: li.sku,
                quantity: li.quantity,
                price: li.price,
              })
            ),
          });
        })
        .filter(Boolean)
        .slice(0, Math.max(1, Math.min(max_orders, 100)));
    }

    return ok({
      found: true,
      product: stripEmpty({
        product_id: product.id,
        title: product.title,
        handle: product.handle,
        vendor: product.vendor,
        product_type: product.product_type,
        matched_variant_id: found.matched_variant_id,
        variants: variants.map((v) =>
          stripEmpty({
            variant_id: v.id,
            title: v.title,
            sku: v.sku,
            barcode: v.barcode,
            price: v.price,
            inventory_quantity: v.inventory_quantity,
          })
        ),
      }),
      inventory_reference: inventoryByVariant,
      recent_order_interactions: recentOrders,
      reference: {
        source_tools_equivalent: [
          'haravan_products_get/list',
          'haravan_inventory_locations',
          'haravan_locations_list',
          ...(include_recent_orders ? ['haravan_orders_list'] : []),
        ],
        lookup_params: stripEmpty(ctx.params),
        generated_at: nowIso(),
      },
      limitations: [
        'Recent order interactions are derived from orders containing this product/variant in line_items.',
        'Staff/user attribution is included only when Haravan order payload exposes user_id/assigned staff fields.',
        'Edit history is not an audit log. To know who changed a product/order field, add webhook/audit persistence.',
      ],
      _meta: {
        days: include_recent_orders ? days : undefined,
        orders_analyzed: include_recent_orders ? ordersAnalyzed : undefined,
        recent_orders_returned: recentOrders.length,
        api_calls_used: apiCalls,
      },
    });
  } catch (e: any) {
    return err(`hrv_product_context failed: ${e?.message ?? e}`);
  }
};

export const productContextSmartTools: McpTool[] = [
  {
    name: 'hrv_product_context',
    project: 'smart',
    description:
      'Get a product/variant operational context with references: product identity, variants/SKUs, inventory by warehouse/location, and recent order interactions containing the product. Use this when users ask where an item is stocked or who is interacting with it via orders.',
    schema: z.object({
      product_id: z.number().optional().describe('Product ID'),
      variant_id: z.number().optional().describe('Variant ID'),
      sku: z.string().optional().describe('Exact SKU lookup'),
      handle: z.string().optional().describe('Product handle/slug'),
      product_query: z.string().optional().describe('Product title, variant title, SKU, barcode, or partial text lookup'),
      include_recent_orders: z.boolean().optional().default(true).describe('Include recent orders containing the product/variant'),
      days: z.number().optional().default(30).describe('Look-back window for recent order interactions'),
      max_orders: z.number().optional().default(20).describe('Maximum matching orders to return'),
    }),
    httpMethod: 'GET',
    path: '/smart',
    scopes: ['com.read_products', 'com.read_inventories', 'com.read_orders', 'com.read_shop'],
    customHandler: productContextHandler,
  },
];
