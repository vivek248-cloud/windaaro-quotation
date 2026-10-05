# WINDAARO - what was fixed

## Bugs (each one was reproduced before fixing; see quotation/tests.py)
1. Payment / expense dates were ignored (auto_now_add). Dates picked in the form are now saved and
   editable. Migration: 0009_editable_dates_and_defaults.
2. Quotation / invoice numbers collided after any delete (count + 1). Now highest number + 1.
3. Editing a quotation/invoice deleted the old items before re-creating them with no transaction;
   a failure left partial data. Saves are now atomic.
4. Receipt popups printed literal {t('...')} (18 places). Fixed.
5. Form totals differed from saved totals (area/amount rounding). The form now rounds like the backend.
6. Zero / negative payments, expenses, discounts and GST > 100% were accepted. Now rejected (400) and
   blocked in the UI. Oversized rows return a friendly 400 instead of a 500.
7. todayIso() used UTC (wrong day in India 00:00-05:30) and default form dates went stale.
   Django TIME_ZONE is now Asia/Kolkata.
8. Project.outstanding_balance meant expenses - paid; the UI means budget - paid. Backend now matches.
9. Django admin: inline item edits now recalculate quotation / invoice totals; totals are read-only.
10. Product photo: the old file is deleted only after the change is saved.

## Duplicates removed
- 7 hardcoded API URLs + dead Api.ts  -> one API_BASE_URL (env: VITE_API_BASE_URL)
- escapeHtml / esc, month names, status-label helpers, todayIso -> src/utils.ts
- quotation vs invoice number generators -> nextDocumentNo()
- two hand-rolled receipt print routines -> existing printWhenReady()
- initial data load re-implemented the loaders

## Other
- Whole-app re-render every second removed (clock is its own component).
- Project list no longer runs extra queries per project.
- Delete customer / project confirmations now say what else is deleted.
- Settings read from environment variables (defaults keep local dev working). requirements.txt added.

## Deliberately NOT changed (decisions for you)
- The API still has no login. Anyone who can reach it can read/edit/delete. Add authentication before
  putting it on the internet.
- Customer/project deletes still cascade (now with a clear warning). Use on_delete=PROTECT if you
  want them blocked.
- Repeated inline print CSS and status-select JSX blocks in App.tsx were left as-is (risky to
  refactor without a UI test suite).

## Run the checks
    pip install -r requirements.txt
    python manage.py test quotation
    cd frontend && npm install && npm run lint && npm run build
