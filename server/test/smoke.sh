#!/bin/bash
# End-to-end smoke test of the critical ParkSecure flow against a running server.
# Usage: BASE=http://localhost:4000 ADMIN_EMAIL=... ADMIN_PASSWORD=... bash test/smoke.sh
set -e
BASE="${BASE:-http://localhost:4000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@parksecure.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?set ADMIN_PASSWORD (see server/.env.example)}"
PASS=0; FAIL=0
check() { if [ "$1" = "$2" ]; then PASS=$((PASS+1)); echo "  ✓ $3"; else FAIL=$((FAIL+1)); echo "  ✗ $3 (expected $2, got $1)"; fi }
jqget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)"; }

echo "1. Auth"
TOKEN=$(curl -s $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | jqget "['token']")
check "$([ -n "$TOKEN" ] && echo ok)" ok "admin login returns token"
AUTH="Authorization: Bearer $TOKEN"

ME_ROLE=$(curl -s $BASE/api/auth/me -H "$AUTH" | jqget "['role']")
check "$ME_ROLE" super_admin "GET /auth/me role"

echo "2. Facility + QR batch"
FACILITY=$(curl -s $BASE/api/entities/Facility -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Test Park","billing_mode":"hourly","hourly_rate":500,"city":"Lagos"}')
FID=$(echo "$FACILITY" | jqget "['id']")
check "$([ -n "$FID" ] && echo ok)" ok "create facility"

QR=$(curl -s $BASE/api/functions/generateQRBatch -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"facility_id\":\"$FID\",\"count\":3,\"batch_name\":\"Smoke Batch\",\"prefix\":\"SMK\"}")
CODE=$(echo "$QR" | jqget "[0]['code_id']")
check "$([ -n "$CODE" ] && echo ok)" ok "generate QR batch ($CODE)"

echo "3. Owner + vehicle"
OWNER_EMAIL="owner-$RANDOM@test.local"
OWNER_TOKEN=$(curl -s $BASE/api/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"OwnerPass123!\",\"full_name\":\"Test Owner\"}" | jqget "['token']")
check "$([ -n "$OWNER_TOKEN" ] && echo ok)" ok "owner registration"

VEHICLE=$(curl -s $BASE/api/entities/Vehicle -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"plate_number\":\"SMK-123-XY\",\"owner_name\":\"Test Owner\",\"owner_email\":\"$OWNER_EMAIL\",\"facility_id\":\"$FID\",\"make_model\":\"Toyota Corolla\"}")
VID=$(echo "$VEHICLE" | jqget "['id']")
check "$([ -n "$VID" ] && echo ok)" ok "create vehicle"

ASSIGN=$(curl -s $BASE/api/functions/assignQRCode -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"vehicle_id\":\"$VID\",\"code_id\":\"$CODE\"}")
check "$(echo "$ASSIGN" | jqget "['qr_code']['status']")" assigned "assign QR to vehicle"

echo "4. Entry scan"
LOOKUP=$(curl -s "$BASE/api/scans/lookup?code=$CODE" -H "$AUTH")
check "$(echo "$LOOKUP" | jqget "['result']")" ok "lookup scanned code"

ENTRY=$(curl -s $BASE/api/scans/entry -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"qr_code_id\":\"$CODE\",\"items\":[{\"name\":\"Laptop\",\"quantity\":1}]}")
check "$(echo "$ENTRY" | jqget "['vehicle']['is_inside']")" True "entry marks vehicle inside"

DUP=$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/scans/entry -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"qr_code_id\":\"$CODE\"}")
check "$DUP" 409 "double entry rejected"

echo "5. Exit + owner approval"
EXIT=$(curl -s $BASE/api/scans/exit -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"qr_code_id\":\"$CODE\",\"items_state\":[{\"name\":\"Laptop\",\"quantity\":1,\"confirmed\":true}]}")
check "$(echo "$EXIT" | jqget "['auto_approved']")" False "exit requires owner approval"
EXIT_TOKEN=$(echo "$EXIT" | jqget "['exit_request']['approval_token']")
BILLED=$(echo "$EXIT" | jqget "['billing']['amount']")
check "$([ "$BILLED" != "0" ] && echo billed)" billed "hourly billing computed (₦$BILLED)"

PENDING=$(curl -s "$BASE/api/entities/ExitRequest?status=pending" -H "Authorization: Bearer $OWNER_TOKEN")
check "$(echo "$PENDING" | jqget "[0]['plate_number']")" SMK-123-XY "owner sees their pending exit request"

APPROVE=$(curl -s $BASE/api/exit/approve-by-token -H 'Content-Type: application/json' \
  -d "{\"token\":\"$EXIT_TOKEN\",\"action\":\"approve\"}")
check "$(echo "$APPROVE" | jqget "['request']['status']")" approved "owner approves by token"

V2=$(curl -s "$BASE/api/entities/Vehicle/$VID" -H "$AUTH")
check "$(echo "$V2" | jqget "['is_inside']")" False "vehicle marked outside after approval"

PAYMENTS=$(curl -s "$BASE/api/entities/Payment?vehicle_id=$VID" -H "$AUTH")
check "$(echo "$PAYMENTS" | jqget "[0]['status']")" pending "payment record created"

echo "6. Access control"
DENIED=$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/entities/Facility -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"Hack Park"}')
check "$DENIED" 403 "owner cannot create facilities"
NOAUTH=$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/entities/Vehicle)
check "$NOAUTH" 401 "unauthenticated list rejected"

echo
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]
