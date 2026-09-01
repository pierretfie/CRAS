# CRAS External Client API

Push clients from an external form / service directly into CRAS.

**Endpoint:** `POST https://cras-middleware.fly.dev/api/clients`
**Auth:** `x-api-key: 60539bc01b164ad780df5ef52cfbb25982991916a24fc355d729f0bba982df92`
**Routing:** `company_id`

## Getting `created_by`
`created_by` must be a valid `profiles.id` from that `company_id`. Get it via:
- Admin → Users → copy ID (click copy icon next to the ID under each user), or
- `SELECT id, name FROM profiles WHERE company_id='YOUR_COMPANY_ID';`

If omitted, middleware falls back to first user in company — explicit is safer.

## Curl Example(uses a Test company & user Ids )
```bash
curl -X POST https://cras-middleware.fly.dev/api/clients \
  -H "Content-Type: application/json" \
  -H "x-api-key: 60539bc01b164ad780df5ef52cfbb25982991916a24fc355d729f0bba982df92" \
  -d '{
    "company_id": "51910a82-19a9-4a77-b95d-3bae8a296b32",
    "created_by": "3b05e257-1f0f-494c-a39a-27398f047532",
    "name": "Acme Ltd",
    "category": "Technology",
    "mode_of_connection": "Website Form",
    "email": "info@acme.com",
    "current_stage": 1,
    "stage_value": 0,
    "interest_scale": 5
  }'
```

Response: `{"id":"...","success":true}`

See `payload.json` for all fields (required vs optional). `product` is optional but important — fill it when available for analytics.
