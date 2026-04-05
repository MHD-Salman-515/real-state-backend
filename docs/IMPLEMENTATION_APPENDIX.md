# IMPLEMENTATION_APPENDIX

## 1) Implemented Phases (1-9)

### Phase 1: External Baseline Dataset
- Added external source/observation/baseline pipeline.
- Admin endpoints for source management, observations, CSV import, and baseline rebuild.

### Phase 2: Explainable AI Trace (Deterministic)
- Added `explain_trace` structure to deterministic outputs.
- Standardized explainability shape with inputs, data sources, computation steps, confidence components.

### Phase 3: Buyer Chat Module
- Added buyer chat sessions/messages and deterministic intent parsing.
- Added property search + explainable payloads.

### Phase 4: Market Intelligence Engine
- Added market snapshots and trend computation endpoints.
- Deterministic trend/volatility outputs from market data.

### Phase 5: Buyer Ranking Engine
- Deterministic multi-factor ranking (price/area/type/location/freshness/trend).
- Added stable payload contract and explain trace for ranking.

### Phase 6: Buyer Chat Frontend UI
- Added buyer chat experience with recommendation cards and suggested actions.

### Phase 7: Saved Searches + Refine Loop
- Persisted saved searches in DB with dedupe hash.
- Added saved searches page + apply flow.
- Added quick refine chips in BuyerChat UI.

### Phase 8: Buyer Recommendation History + Admin Export
- Logged buyer recommendation runs (`FIND_PROPERTIES`, `BUYER_REFINE`).
- Added buyer history APIs and admin export (JSON/CSV).

### Phase 9: Owner Portfolio AI Analyzer
- Added deterministic portfolio-level pricing analyzer.
- Added apply-recommendation endpoint and owner UI page with explainability.

---

## 2) DB Tables Added (Key Fields)

### `advisor_request_logs`
- `id`, `endpoint`, normalized area fields, `sample_count`, `fx_used`, `confidence`, `result_json`, `created_at`.

### `advisor_outcomes`
- `id`, `log_id`, `action`, `final_price_syp`, `owner_id`, `created_at`.

### `owner_market_watch`
- `id`, `owner_id`, `city`, `district`, `property_type`, `days_window`, timestamps.

### `chat_sessions` / `chat_messages`
- Owner chat session/message persistence including `intent`, `payload_json`, and session context metadata.

### `buyer_chat_sessions` / `buyer_chat_messages`
- Buyer chat sessions and messages.
- Session supports `meta_json` for last query/sort state.

### `buyer_saved_searches`
- `id`, `buyer_id`, `title`, `filters_json`, `filters_hash` (unique), `created_at`.

### `buyer_recommendation_logs`
- `id`, `buyer_id`, `session_id`, `intent`, `query_json`, `results_json`, `market_context_json`, `created_at`.

### External baseline tables
- `external_market_sources`
- `external_market_observations`
- `external_baseline_indices`

### Market intelligence table
- `market_snapshot_daily`

### Market data extensions
- `market_data.ingest_hash`
- `market_data.is_outlier`

---

## 3) Endpoints Added (Grouped)

### Auth
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

### Owner Chat
- `POST /owner/chat/sessions`
- `GET /owner/chat/sessions`
- `GET /owner/chat/sessions/:id/messages`
- `POST /owner/chat/sessions/:id/message`
- `POST /owner/chat/actions/apply-price`
- `PATCH /owner/chat/sessions/:id/context`
- `PATCH /owner/chat/sessions/:id/archive`
- `DELETE /owner/chat/sessions/:id`

### Advisor
- `POST /advisor/seller-price`
- `POST /advisor/buyer-evaluate`
- `POST /advisor/explain`
- `POST /advisor/track`
- `GET /advisor/analytics`
- `GET /advisor/insights`
- `POST /advisor/simulate`

### Buyer Chat + Search
- `POST /buyer/chat/sessions`
- `GET /buyer/chat/sessions`
- `GET /buyer/chat/sessions/:id/messages`
- `POST /buyer/chat/sessions/:id/message`
- `GET /buyer/recommendations`

### Buyer Saved Searches
- `POST /buyer/saved-searches`
- `GET /buyer/saved-searches`
- `DELETE /buyer/saved-searches/:id`

### Buyer History
- `GET /buyer/history`
- `GET /buyer/history/:id`
- `GET /admin/buyer/history/export`

### Owner Portfolio / Strategy
- `GET /owner/portfolio`
- `GET /owner/portfolio/analysis`
- `POST /owner/portfolio/apply-recommendation`
- `GET /owner/properties/:id/strategy`
- `PATCH /owner/properties/:id/price`

### Market Intelligence
- `POST /admin/market/rebuild-snapshots`
- `GET /market/trends`

### External Market Baseline
- `POST /admin/external-market/sources`
- `GET /admin/external-market/sources`
- `POST /admin/external-market/observations`
- `POST /admin/external-market/import-csv`
- `POST /admin/external-market/rebuild-baseline`
- `GET /admin/external-market/baseline`

### Admin Exports
- `GET /admin/advisor/export`
- `GET /admin/chat/export`
- `GET /admin/chat/rag-dump`
- `GET /admin/buyer/history/export`

---

## 4) Deterministic Design + `explain_trace`

### Deterministic principles
- No numeric generation by LLM for pricing decisions.
- Numeric outputs derived from DB-backed formulas/services (`advisor`, `market`, `ranking`, `market brain`).
- Any AI wording layer is explanatory only; core computation remains deterministic.

### `explain_trace` structure
- `inputs_used`: normalized inputs and key request values.
- `data_sources`: which table/data points contributed.
- `computation_steps`: explicit formula/step sequence.
- `confidence_components`: sample/recency/stability-derived confidence signals.
- `comparables` (optional): compact comparable snapshots.

This trace is attached to API responses and reused in UI “ليش هيك؟” sections.

---

## 5) Security Model

### Authentication and roles
- JWT-based authentication with `JwtAuthGuard`.
- Role checks with `RolesGuard` + `@Roles(...)` (e.g., `OWNER`, `CLIENT`, `ADMIN`).

### Ownership checks
- Owner endpoints verify property/session ownership (`ownerId == req.user.id`).
- Buyer endpoints verify chat/history/search ownership (`buyerId == req.user.id`).
- Admin export endpoints restricted to `ADMIN` only.

### Data safety
- Cross-user access prevented by owner/buyer scoped queries.
- Export endpoints avoid PII-sensitive fields in recommendation/chat payload exports.
