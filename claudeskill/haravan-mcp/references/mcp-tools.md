# Haravan MCP Tool Catalog

## Kiến trúc 2 lớp

**MCP Server** (7 smart tools): pagination lớn, rate limiting, full-population scoring, batch inventory calls
**Claude Skill** (bạn): phân tích, group by, filter, insight, so sánh — từ data smart tools trả về

---

## Smart Tools (7) — Server-side aggregation

### hrv_orders_summary
- **Input**: `date_from`, `date_to`, `compare_prior` (default: true)
- **Output**: revenue, AOV, orders by status (paid/pending/refunded/cancelled), orders by source (web/pos/iphone/android/other), cancel_reasons breakdown, discount_usage (orders_with_discount, total_discount_value), comparison vs prior period (% change)
- **Dùng khi**: Mọi câu hỏi về doanh thu, đơn hàng, tổng quan
- **Claude tự làm từ output này**:
  - Channel breakdown → đã có trong `orders_by_source`
  - Cancel analysis → đã có trong `orders_by_status.cancelled` + `cancel_reasons`
  - Discount overview → đã có trong `discount_usage`
  - COD estimate → đếm orders có gateway_code chứa "cod" (nếu cần chi tiết hơn → dùng `haravan_orders_list`)
  - ODR (Order Defect Rate) → (cancelled + refunded) / total_orders

### hrv_top_products
- **Input**: `date_from`, `date_to`, `top_n` (default: 10)
- **Output**: Top N products by revenue, each with total_quantity, total_revenue, variant_breakdown (top 3 variants)
- **Dùng khi**: Sản phẩm bán chạy, revenue concentration, variant performance
- **Claude tự làm từ output này**:
  - Revenue concentration → top 3 / total revenue %
  - Variant hot nhất → variant_breakdown[0]
  - Price sweet spot → total_revenue / total_quantity per product

### hrv_order_cycle_time
- **Input**: `date_from`, `date_to`
- **Output**: total_orders, time_to_confirm_hours (median, p90), time_to_close_hours (median, p90), stuck_orders (unconfirmed_gt_48h, paid_not_fulfilled_gt_24h)
- **Dùng khi**: Pipeline, bottleneck, tốc độ xử lý, đơn kẹt
- **Claude tự làm từ output này**:
  - Chấm điểm processing speed → so với benchmark
  - Revenue at risk → stuck_orders × AOV (lấy AOV từ orders_summary)

### hrv_customer_segments
- **Input**: `min_orders` (default: 0)
- **Output**: segments array (name, count, pct, total_revenue, avg_order_value, action_suggestion), total_customers
- **Dùng khi**: RFM, khách VIP, khách sắp mất, retention
- **Claude tự làm từ output này**:
  - Repeat Purchase Rate → (total - New - Lost) / total
  - Customer Concentration → Champions revenue / total revenue
  - At Risk value → At_Risk.total_revenue (tiềm năng mất)
  - Win-back ROI estimate → At_Risk.count × AOV × 20% recovery rate

### hrv_inventory_health
- **Input**: `low_stock_threshold` (default: 5), `days_for_dead_stock` (default: 90)
- **Output**: summary (out_of_stock, low_stock, healthy, dead_stock counts + total_dead_stock_value), top_10_low_stock, top_10_dead_stock
- **Dùng khi**: Sức khỏe tồn kho, SKU hết hàng, dead stock
- **Claude tự làm từ output này**:
  - Stock-out Rate → out_of_stock / total_variants_analyzed
  - Dead Stock % → dead_stock / total
  - Revenue loss estimate → out_of_stock items × avg daily revenue (from orders_summary)

### hrv_stock_reorder_plan
- **Input**: `lead_time_days` (default: 7), `safety_factor` (default: 1.3), `date_range_days` (default: 30)
- **Output**: reorder_plan array (product_title, variant_title, sku, qty_available, daily_sales_rate, days_of_stock, reorder_point, reorder_qty_suggested)
- **Dùng khi**: Nhập hàng, restock, dự báo hết hàng
- **Claude tự làm từ output này**:
  - Urgency classification → days_of_stock < lead_time = URGENT
  - Total reorder value estimate → SUM(reorder_qty × price)

### hrv_inventory_imbalance
- **Input**: (none)
- **Output**: imbalanced_variants array (product_title, variant_title, sku, imbalance_ratio, locations breakdown, suggested_transfer)
- **Dùng khi**: Multi-location, cân bằng kho, đề xuất chuyển hàng
- **Claude tự làm từ output này**:
  - Tổng transfers cần thực hiện
  - Priority ranking → sort by imbalance_ratio

---

## Base Tools — Detail, CRUD, Drill-down

### Read
| Tool | Mô tả | Dùng khi |
|------|--------|---------|
| `haravan_shop_get` | Thông tin shop (name, domain, currency, timezone) | Context shop, format tiền |
| `haravan_orders_list` | Danh sách đơn (có filter date, status) | Drill-down sau smart tool, filter cụ thể |
| `haravan_orders_get` | Chi tiết 1 đơn (line_items, shipping, transactions) | Tra cứu đơn cụ thể |
| `haravan_customers_list` | Danh sách khách | Browse khách hàng |
| `haravan_customers_search` | Tìm khách (email, phone, name) | Tìm khách cụ thể |
| `haravan_customers_get` | Chi tiết 1 khách | Drill-down khách |
| `haravan_products_list` | Danh sách sản phẩm | Browse catalog, tự scoring |
| `haravan_products_get` | Chi tiết 1 sản phẩm (variants, images) | Drill-down sản phẩm |
| `haravan_locations_list` | Danh sách kho/chi nhánh | Multi-location context |
| `haravan_inventory_locations` | Tồn kho variant theo location | Check tồn kho cụ thể |

### Write (LUÔN xác nhận trước)
| Tool | Mô tả |
|------|--------|
| `haravan_orders_confirm` | Xác nhận đơn |
| `haravan_orders_cancel` | Hủy đơn (reason: customer/inventory/fraud/declined) |
| `haravan_orders_close` / `haravan_orders_open` | Đóng/mở lại đơn |
| `haravan_transactions_create` | Ghi thanh toán (kind: Capture/Refund) |
| `haravan_products_create` / `update` / `delete` | CRUD sản phẩm |
| `haravan_variants_create` / `update` | CRUD variant |
| `haravan_inventory_adjust_or_set` | Điều chỉnh kho (type: adjust/set) |
| `haravan_customers_create` / `update` | CRUD khách hàng |

---

## Benchmarks ngành E-commerce Việt Nam

| Metric | Tốt | Trung bình | Cần cải thiện |
|--------|------|------------|---------------|
| Cancel Rate | <3% | 3-5% | >5% |
| AOV | >300k VND | 200-300k | <200k |
| Repeat Purchase Rate | >30% | 20-30% | <20% |
| Fulfillment Rate | >95% | 90-95% | <90% |
| Time-to-Confirm (median) | <4h | 4-12h | >12h |
| Time-to-Close (median) | <48h | 48-72h | >72h |
| COD Fail Rate | <15% | 15-25% | >25% |
| Stock-out Rate (% SKU) | <5% | 5-10% | >10% |
| Dead Stock % | <5% | 5-10% | >10% |
| Discount Penetration | 10-20% | 20-40% | >40% |
| Revenue Growth (MoM) | >10% | 0-10% | <0% |
| Collection Rate | >95% | 90-95% | <90% |

---

## Claude tự làm — KHÔNG cần smart tool

Các phân tích sau Claude thực hiện trực tiếp từ data smart tools đã trả:

| Phân tích | Data source | Claude xử lý |
|-----------|------------|---------------|
| Channel breakdown | `orders_summary.orders_by_source` | Tính % mỗi kênh, so sánh AOV |
| Cancel analysis | `orders_summary.cancel_reasons` | Group by reason, tính % |
| Discount overview | `orders_summary.discount_usage` | Penetration rate, avg discount |
| COD overview | `orders_summary.orders_by_source` + gateway | Filter COD, tính fail rate |
| Catalog health score | `haravan_products_list` | Tự score 0-100 theo criteria |
| Geography analysis | `haravan_orders_list` (filtered) | Group by province |
| Location performance | `haravan_orders_list` + `haravan_locations_list` | Group by location_id |
| Operations scorecard | Tất cả smart tools | Chấm điểm 1-10 mỗi dimension |
