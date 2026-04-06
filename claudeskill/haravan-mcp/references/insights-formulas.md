# Công thức & Insights nâng cao — Haravan MCP

Tất cả công thức dưới đây Claude tự tính từ data trả về bởi 7 smart tools + base tools.
Không cần smart tool riêng cho từng insight — Claude AI là lớp phân tích.

---

## I. ORDER OPERATIONS

### Order Cycle Time Breakdown
**Data source**: `hrv_order_cycle_time`
- **Time-to-Confirm** = confirmed_at − created_at (median + p90 có sẵn)
- **Time-to-Close** = closed_at − created_at (median + p90 có sẵn)
- Ngưỡng: Confirm >4h = chậm. Close >72h = fulfillment vấn đề
- Median vs p90 chênh lớn → có outlier đơn kẹt cực lâu
- Stuck orders: unconfirmed >48h, paid-unfulfilled >24h → revenue at risk

### Order Defect Rate (ODR)
**Data source**: `hrv_orders_summary` → `orders_by_status`
- **ODR** = (cancelled + refunded) / total_orders × 100%
- Benchmark: <1% xuất sắc, 1-3% OK, 3-5% cần cải thiện, >5% nghiêm trọng
- Cross-reference `cancel_reasons` → phát hiện supply chain issue vs customer issue
- Cancel theo `orders_by_source` → web hủy nhiều hơn POS → vấn đề online UX

### Revenue at Risk
**Data source**: `hrv_orders_summary` + `hrv_order_cycle_time`
- **Lost (Cancelled)** = orders_by_status.cancelled × AOV
- **Stuck Risk** = stuck_orders × AOV
- Seller VN bán COD thường 15-30% đơn hoàn → Revenue at Risk rất lớn

### Payment Collection Efficiency
**Data source**: `hrv_orders_summary` → `orders_by_status`
- **Collection Rate** = paid / (total − cancelled) × 100%
- **Outstanding** = pending × AOV (ước tính)
- Collection Rate thấp + COD cao → vấn đề hoàn COD

### Discount Effectiveness
**Data source**: `hrv_orders_summary` → `discount_usage`
- **Penetration Rate** = orders_with_discount / total_orders × 100%
- Benchmark: >40% = "nghiện" giảm giá — cần giảm tần suất
- **Total Discount Value** → so sánh với total_revenue → discount depth
- Nếu cần per-code detail: `haravan_orders_list` → parse `discount_codes` → tính ROI per code

### COD Risk Profile
**Data source**: `hrv_orders_summary` hoặc `haravan_orders_list` (filter gateway_code)
- Claude tự filter đơn COD từ orders data
- **COD Fail Rate** = cancelled COD / total COD × 100%
- Group by `shipping_address.province` → tỉnh nào fail cao
- Benchmark: <15% tốt, 15-25% cảnh báo, >25% dừng COD tỉnh đó

---

## II. PRODUCT & INVENTORY

### ABC-FSN Analysis
**Data source**: `hrv_top_products` + `hrv_inventory_health`
- **A-items** (top 20% SKU → ~80% DT): Luôn đầy kho
- **B-items** (30% SKU → ~15% DT): Duy trì, tối ưu
- **C-items** (bottom 50% SKU → ~5% DT): Candidate discontinue
- **Fast**: ≥1 unit/ngày | **Slow**: <1/tuần | **Non-moving**: 0 trong 90 ngày
- Ma trận ABC × FSN: A+Fast = KING, C+Non-moving = Loại bỏ

### Inventory Velocity
**Data source**: `hrv_stock_reorder_plan`
- **DSR** (Daily Sales Rate) = `daily_sales_rate` (có sẵn)
- **DOS** (Days of Stock) = `days_of_stock` (có sẵn)
- **Reorder Point** = `reorder_point` (có sẵn)
- **Reorder Qty** = `reorder_qty_suggested` (có sẵn)
- **Alert Matrix**:
  - DOS < lead_time → 🔴 URGENT: sẽ hết trước khi hàng về
  - DOS < 2× lead_time → ⚠️ SOON: cần đặt hàng ngay
  - DOS > 90 → 💀 DEAD: quá nhiều tồn kho

### Dead Stock Analysis
**Data source**: `hrv_inventory_health`
- Dead stock = qty >0 nhưng 0 sales trong N ngày
- **Dead Stock Value** = `total_dead_stock_value` (có sẵn)
- **Dead Stock %** = dead_stock / total_variants_analyzed
- Hành động: Flash sale, bundle, donate, thanh lý

### Product Catalog Health Score
**Data source**: `haravan_products_list` → Claude tự score
- Claude fetch products rồi áp 12 tiêu chí:

| Tiêu chí | Điểm | Logic |
|----------|-------|-------|
| Title >10 ký tự | +10 | Tên rõ ràng |
| body_html >50 ký tự | +15 | Mô tả có nội dung |
| ≥1 image | +10 | Hình ảnh cơ bản |
| ≥3 images | +5 | Hình ảnh đầy đủ |
| Có product_type | +5 | Phân loại đúng |
| Có vendor | +5 | Nhà cung cấp |
| Có tags | +5 | Gắn tag |
| Tất cả variants có SKU | +15 | Quản lý kho chuẩn |
| Tất cả variants có barcode | +10 | Scan được |
| Tất cả variants price >0 | +10 | Không lỗi giá |
| Có compare_at_price | +5 | Giá gốc hiển thị |
| inventory_management = haravan | +5 | Track stock |

- Tổng: 100 điểm. Excellent ≥80, Good 60-79, Needs work 40-59, Poor <40

### Multi-Location Imbalance
**Data source**: `hrv_inventory_imbalance`
- Imbalance ratio >5x = cần transfer
- `suggested_transfer` có sẵn: from_location, to_location, qty
- Priority: sort by imbalance_ratio DESC

---

## III. CUSTOMER INTELLIGENCE

### RFM Scoring (Quintile method)
**Data source**: `hrv_customer_segments`
- Server đã tính quintile và phân segment — Claude chỉ cần đọc kết quả
- 7 segments: Champions, Loyal, Potential_Loyalists, New, At_Risk, Hibernating, Lost

| Segment | R | F | M | Marketing Action |
|---------|---|---|---|-----------------|
| Champions | ≥4 | ≥4 | ≥4 | Loyalty program, referral rewards, early access |
| Loyal | ≥3 | ≥4 | ≥3 | Cross-sell, tăng AOV |
| Potential Loyalists | ≥4 | ≤3 | ≤3 | Nurture: incentive mua lần 2-3 |
| New Customers | ≥4 | =1 | any | Welcome series, voucher mua lần 2 |
| At Risk | ≤2 | ≥3 | ≥3 | **Win-back NGAY**: mã cá nhân, "Chúng tôi nhớ bạn" |
| Hibernating | ≤2 | ≤2 | any | Re-engagement offer mạnh |
| Lost | =1 | =1 | any | Lookalike audience, không win-back |

### Customer Concentration Risk
**Data source**: `hrv_customer_segments`
- Champions revenue / total revenue → nếu <10% khách chiếm >60% DT → rủi ro tập trung
- At Risk revenue → potential loss nếu không act
- **Pareto check**: Top segment chiếm bao nhiêu %

### Acquisition vs Retention
**Data source**: `hrv_customer_segments`
- New Customers revenue = segment "New".total_revenue
- Returning revenue = tổng − New
- >50% returning = lành mạnh. 80% new → phụ thuộc marketing, không bền

### Repeat Purchase Rate
**Data source**: `hrv_customer_segments`
- RPR = (total_customers − New.count − Lost.count) / total_customers
- Hoặc: (Champions + Loyal + Potential + At Risk + Hibernating) / total
- Benchmark: >30% tốt, 20-30% TB, <20% cần cải thiện retention

---

## IV. OMNICHANNEL

### Channel Performance
**Data source**: `hrv_orders_summary` → `orders_by_source`
- Revenue per channel (web/pos/mobile)
- Cancel rate per channel: filter cancel_reasons by source
- POS thường AOV cao hơn web 30-50% (VN)
- Mobile conversion thường thấp nhất

### Geographic Intelligence
**Data source**: `haravan_orders_list` → Claude group by `shipping_address.province`
- Revenue per province + AOV per province
- Tỉnh AOV cao + volume thấp = tiềm năng chưa khai thác
- Cancel rate cao theo tỉnh thường liên quan COD fail
- Top 5 tỉnh thường chiếm 60-80% tổng DT

### Location Performance
**Data source**: `haravan_orders_list` + `haravan_locations_list`
- Claude group orders by `location_id`
- Per location: revenue, order_count, AOV, fulfillment_rate
- Revenue per location / inventory cost per location = GMROI proxy

---

## V. OPERATIONS SCORECARD

### Composite Health Score
**Data sources**: Tất cả smart tools gọi song song → Claude tự chấm điểm

| Dimension | Tool source | Metric | Score 1-10 |
|-----------|-----------|--------|------------|
| Revenue Growth | orders_summary (compare_prior) | % change | >20%=10, 5-20%=8, 0-5%=6, <0=3 |
| AOV | orders_summary | aov | >500k=10, 300-500k=8, 200-300k=6, <200k=3 |
| Processing Speed | order_cycle_time | median confirm | <2h=10, 2-4h=8, 4-8h=6, >8h=3 |
| Cancel Rate | orders_summary | cancelled/total | <1%=10, 1-3%=8, 3-5%=6, >5%=3 |
| Stock Health | inventory_health | out_of_stock % | <2%=10, 2-5%=8, 5-10%=6, >10%=3 |
| Dead Stock | inventory_health | dead_stock % | <2%=10, 2-5%=8, 5-10%=6, >10%=3 |
| Customer Retention | customer_segments | RPR | >40%=10, 30-40%=8, 20-30%=6, <20%=3 |

**Tổng điểm** = Mean(all dimensions) → X.X / 10
