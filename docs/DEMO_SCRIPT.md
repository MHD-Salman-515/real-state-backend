# DEMO_SCRIPT

## Scenario 1: Buyer Smart Search + Refinement

### Goal
Show Buyer Chat ranking, refine loop, and saving searches.

### Steps
1. Login as `CLIENT` using `POST /auth/login` and keep `token`.
2. Create buyer chat session: `POST /buyer/chat/sessions`.
3. Send message:
   - `بدي شقة 120 متر بحدود 300 مليون بالمزة`
4. Observe assistant response payload:
   - `recommended_properties` (top ranked)
   - `query`, `ranking`, `market_context`, `explain_trace`
5. Send refinement message:
   - `أرخص`
6. Confirm intent switches to `BUYER_REFINE` and results update using previous query context.
7. Trigger save search via UI action or API:
   - `POST /buyer/saved-searches`
8. Verify saved list:
   - `GET /buyer/saved-searches`

### Expected key outputs
- Ranked properties include `score`, `reasons`, `why_short`.
- Refinement reuses last query (not a fresh unrelated search).
- Saved search deduplicates by `filtersHash`.

---

## Scenario 2: Owner Chat + Deterministic Pricing

### Goal
Show owner chat using deterministic advisor logic and actionable outputs.

### Steps
1. Login as `OWNER` and keep `token`.
2. Create session: `POST /owner/chat/sessions`.
3. Send message with property context:
   - Body: `{ "message": "قيّم سعر عقاري", "context": { "propertyId": 1 } }`
4. Inspect assistant/tool outputs:
   - `SELLER_PRICE` or `BUYER_EVALUATE` intent
   - `explain_trace` in payload
5. Execute action (if provided):
   - `POST /owner/chat/actions/apply-price`

### Sample user messages
- `قيّم سعر عقاري`
- `بدّي بيع بسرعة`
- `اشرح ليش هيك`

### Expected key outputs
- Deterministic prices/ranges from advisor data, no hallucinated numbers.
- `TOOL_EXECUTION` messages for executed actions.
- Explain trace available for UI accordion (`ليش هيك؟`).

---

## Scenario 3: Owner Portfolio Analyzer

### Goal
Show full portfolio scan (overpriced/fair/underpriced) and one-click recommendation apply.

### Steps
1. Call `GET /owner/portfolio/analysis`.
2. Review summary:
   - `total`, `overpriced`, `fair`, `underpriced`
3. Pick one item with `OVERPRICED` and apply:
   - `POST /owner/portfolio/apply-recommendation`
   - Body: `{ "propertyId": 1, "target": "OPTIMAL" }`
4. Re-run `GET /owner/portfolio/analysis`.

### Expected key outputs
- Item has `deviation_pct`, `label`, `recommendation`, `suggested_actions`, `explain_trace`.
- Apply endpoint updates property price deterministically.
- UI summary counters and item values refresh after apply.
