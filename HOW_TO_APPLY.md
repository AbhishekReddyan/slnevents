# Update 5: worker dashboard, remembered customer, photo auto-delete

AI-generated code. Have a developer review it and run the test checklist below before using it with real orders.

## Steps

1. Copy every file from the changed-files zip over the same path in your project (new folders are created as needed).
2. In the Supabase SQL Editor run, in order and once each: `010_worker_dashboard_customer_memory_photo_cleanup.sql`, then `011_customer_accounts.sql`, then `012_any_pin_allowed.sql` (only needed if you ran 011 before this change; safe either way), then `013_owner_customers.sql`, then `014_staff_pin_login.sql`, then `015_worker_upcoming.sql`, then `016_customer_complete_and_bill.sql`, then `017_add_on_orders.sql`, then `018_customer_estimate.sql` (the wrong-password lock; the name is historical). Do not re-run 001 to 009.
3. New environment variable (Vercel project settings, and `.env.local` for local testing):
   - `CRON_SECRET` = a long random string (for example the output of `openssl rand -hex 32`).
   - Optional: `CUSTOMER_SESSION_SECRET` = another long random string (signs customer login cookies; if missing, the service role key is used).
   `SUPABASE_SERVICE_ROLE_KEY` is already used by the Staff page and must also be set on Vercel. It stays server-only.
4. Daily cleanup on Vercel: `vercel.json` (included) registers a cron job that calls `/api/cron/cleanup` every day at 21:30 UTC (3:00 am India time). After you set `CRON_SECRET` and redeploy, open Vercel, then Settings, then Cron Jobs, and check that the job is listed. Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically. Hobby plans allow one run a day, which is enough.
5. Redeploy (push to GitHub). Locally: `npm run dev`.

## Why Vercel Cron and not pg_cron

Photo files live in Supabase Storage, and SQL cannot delete them properly (removing rows from `storage.objects` leaves the files behind). So the code that runs must call the Storage API with the service role key. A Vercel Cron route does that directly, needs no extension, and its logs are in Vercel. `pg_cron` would only be a clock that has to call the same web address anyway.

## What changed

- **Worker home** (`/worker`): today's functions count, tasks done and left, progress bars per task type, "Late" section, cards ordered by Deliveries, Pickups, Return check-ins. Data comes from `worker_dashboard()` (no prices). "Today" is `shop_today()`. The date picker still works: another date shows the earlier day-by-day lists with a "Back to today" link.
- **Customer landing page and accounts** (replaces the cookie idea above; the old cookie code was removed):
  - `/` is a simple landing page: tagline "One stop for every event" over a tent illustration (`public/hero-tent.svg`, replace it with a real photo of the same name or change the CSS in `src/app/page.tsx`) and the Register / Log in card. **Staff login** is at the top right. After login the page shows Tent House and Decoration.
  - Register with name, mobile number and a 4-digit PIN of the customer's choice. Log in with mobile number + PIN (the name is shown as "Hi <name>"). Mobile number is the login because names are not unique.
  - PINs are stored hashed in the database. 5 wrong PINs lock the account for 15 minutes, 10 wrong PINs for 24 hours. A 4-digit PIN is weak by nature, so this lock is what protects it.  Any 4-digit PIN is allowed. Forgotten PIN: owner resets it in the SQL Editor: `update customers set pin_hash = crypt('4821', gen_salt('bf', 8)), failed_attempts = 0, locked_until = null where phone = '9XXXXXXXXX';` (pick a new PIN, tell the customer to keep it private).
  - `/order` has two tabs: **Tent House** (all items with price per day, running estimate, "transport will be added later") and **Decoration** (all designs, photos only). Anyone can browse and see the estimate; **sending a request needs a login**. Name and phone come from the account.
  - **My orders** (`/account`): the customer's own orders, status, delivered and pending quantities, and the delivery/pickup photos the workers uploaded (private links that expire; photos disappear after the retention period, see photo auto-delete).
  - Orders are linked to the account, never to a phone number alone, so someone registering with another person's number cannot see that person's orders or photos. The anonymous order function `submit_order` is closed (no longer callable from the browser). Existing tracking links (`/track/...`) still work.
- **Order tracking for customers**: after logging in (any time, any device) the home page shows "Track your orders" with a progress bar per open order; each order page has the full step tracker (Request received, Confirmed, Delivered, Picked up, Closed) and the photos.
- **Owner: Customers page** (`/admin/customers`): name, mobile, registration date, order count, last order, locked flag, a link to the customer's orders, and a **Reset PIN** box (the owner types a new 4-digit PIN and tells the customer). Needs migration 013.
- **Rotating backgrounds**: four colourful pictures fade into each other behind the home page (dark overlay) and the customer pages (light overlay). Files are `public/hero-tent.svg`, `bg-flowers.svg`, `bg-night.svg`, `bg-mandap.svg`; replace them with real photos of the same file names (or edit the list in `src/components/Backdrop.tsx`).
- **Staff login link** now shows only on the home page.
- **Staff and owner login** (`/login`): one form, **email or mobile number + password** (min 8 characters), for workers and owners alike. The Staff page creates a worker **or an owner** and each row has a mobile-number box and an optional new-password box (this is how your existing owner gets a mobile number). Wrong passwords on a mobile number lock it: 5 tries = 15 minutes, 10 = 24 hours (needs migration 014). Customers still use mobile + 4-digit PIN.
- **Backgrounds**: the rotating pictures now sit behind every page (login, owner, worker, tracking, thanks as well as the customer pages).
- **Transport charge**: a separate **Transport charge** card on the owner order page (Save button), for entering it last. It is removed from the big Edit form (the value is kept). Item prices come from Inventory as before.
- **Add-on orders**: if a logged-in customer sends another request for the same dates while their first order is already Loaded, Delivered or Picked up, it becomes an **add-on** stacked under the first order (owner Orders list, owner order page with a combined total, worker cards, customer My orders). While the first order is still Pending or Confirmed, items are still merged into it. Different dates stay a separate order. Needs migration 017.
- **Worker portal restyled** like the owner pages: same header and tab row, stat cards, progress bars, white order cards.
- **Approximate bill on the customer's order page**: from the moment an order is placed, its page shows an **Approximate bill** (each item x price per day x days, discount, decoration, transport "Will be added later", approximate total). The prices come from your Inventory prices at the time of the order, so no sample values are used; items with no price set show "-". It is replaced by the final **View bill** after the event is marked completed. Needs migration 018. (The separate reference-quotation page was removed.)
- **Phone layout and speed**: the page can no longer be wider than the screen (wide tables scroll inside their own box); the rotating background is a single still picture on phones; customer pages no longer make an extra login-check call; repeated lookups (logo, settings, profile) are done once per page; owner header loads in parallel. `vercel.json` now runs the server code in Singapore (`sin1`), next to the Supabase project (it was running in Washington, USA). If you ever move Supabase, change `regions` in `vercel.json`. Login and page loads also make fewer database calls.
- **Event completed and bill (customer)**: once an order is Delivered, the customer's order page shows **Mark event as completed**. It asks for pickup (the owner gets the same alert as before) and then a **View bill** button appears, also for orders already picked up or closed. The bill lists each item with quantity, price per day and amount for the number of days, discount, decoration charge, transport ("Not added yet" until you enter it) and the total, with a print / save as PDF button. It uses the prices you enter on the owner order page. Needs migration 016.
- **One photo for all Annada Patre sizes**: at delivery and pickup the worker enters the quantity per size as before, but takes a single photo of the stacked Patre. The photo is saved for every size that has a quantity. Quantities and checks are unchanged; other items still need their own photo. The list of shared groups is in `src/lib/photo-groups.ts`.
- **Worker dashboard redesign**: progress ring, coloured tiles for deliveries, pickups and return check-ins, bigger task cards with Call and Open buttons. The date picker was removed; the page always shows today, plus a **Coming up** list of confirmed/loaded orders starting in the next 7 days (not counted as today's tasks; needs migration 015).
- **Staff login page**: English only.
- **Decoration designs**: photo only, no names (the database keeps an automatic "Design N").
- **Photo auto-delete**: setting "Keep delivery and pickup photos for (days)" on the Settings page (default 2). Photos are deleted when the date is more than that many days after the event end date, or after the last not-returned item was resolved. Orders with open not-returned items keep their photos. Photos are only deleted for orders already picked up, returned, closed or cancelled, so a late order that is still with the customer keeps its delivery photos. The owner order page shows "Photos will be deleted on [date]", a "Delete photos now" button, and after deletion "Photos were deleted automatically on [date]". The order and quantities stay.

## Test checklist

**Worker dashboard** (log in as a worker; use `?date=` to confirm other days still work)
1. Create four orders in Supabase or the app and approve them. Today means the shop date:
   A: confirmed, start = end = today. B: delivered, start = end = today. C: delivered, start 2 days ago, end yesterday. D: picked up, end = today.
2. Expected: functions today = 3 (A, B, D). Deliveries 1 / 2 (A open, B done). Pickups 1 / 2 (B open, D done). Return check-ins 0 / 1 (D open). Combined 2 of 5 complete, 3 left. "Late (1)" shows order C pickup. No prices anywhere.
3. Mark A loaded, then deliver with a photo. The page refreshes by itself and Deliveries becomes 2 / 2.
4. Tap a phone number: the dialer opens. Tap a card: the worker order page opens.

**Customer accounts**
1. Open `/`: staff login at the top right, Register card on the page. Register with a name, a mobile number and a PIN (any 4-digit PIN works, e.g. 1111; mismatched PINs are refused).
2. After registering you land on `/order` with "Hi <name>" in the top bar. The Tent House tab lists every item with its price and the estimate bar updates; the Decoration tab shows photos only. Pick items and a design, enter an address, send. You land on the order page in My orders.
3. Log out, log in with mobile + PIN: works. Enter a wrong PIN 5 times: "Try again in 15 minute(s)", even with the right PIN.
4. Not logged in: the form shows "register or log in" and the send button is disabled.
5. Send a second request with the same dates: it merges into the first order (message on the order page; owner gets a "Customer added items" alert).
6. Register a second account using the first account's phone number: refused ("already registered"). Register with a different number and order with the same dates: a separate order; that customer cannot open the first customer's order (the URL gives "not found").
7. Log out and log in again: the home page lists the open order with its progress bar; the order page shows the step tracker. `/admin/customers` lists the customer; Reset PIN lets that customer log in with the new PIN.
8. Deliver an order as a worker with photos. In My orders, the customer sees delivered quantities, any pending quantities and the photos with time.

**Photo cleanup (without waiting two days)**
1. Take a test order through delivery and pickup with photos (check-in optional).
2. In the Settings page set photos days to 0, or leave 2 and move the dates back in the SQL Editor:
   `update orders set start_date = current_date - 6, end_date = current_date - 5 where order_no = <N>;`
3. Owner order page should say "Photos will be deleted on [date]".
4. Dry run: `curl -H "Authorization: Bearer $CRON_SECRET" "https://YOUR-SITE/api/cron/cleanup?dry=1"` returns `due` (photo rows) and deletes nothing. A call without the header returns 401.
5. Real run: same call without `?dry=1`. Expected JSON: `orders`, `filesDeleted`, `rowsDeleted`. Run it again: all zeros. The order page now says "Photos were deleted automatically on [date]" and the quantities are intact. Check the `proof-photos` bucket in Supabase: the files are gone.
6. Open items: on another test order leave a not-returned (late or missing) item open and move dates back. The cleanup must skip it. Mark the item received, set `resolved_at` back with `update outstanding_items set resolved_at = now() - interval '5 days' where order_id = '<id>';`, and run again: now deleted.
7. "Delete photos now" on an order with photos removes them at once; the page then says they were deleted by the owner.

## What was not tested

The migration and the database functions were not run against a live Supabase project, and the cleanup route was not called against real Storage. TypeScript compiles for all new and changed files. `npx tsc` and `npm run build` still report errors in `middleware.ts` and `src/lib/supabase/server.ts` (implicit `any` in the `setAll` callback). Those files were not touched; they most likely come from the installed `@supabase/ssr` version, so run `npm install` and re-check on your machine. The task-counting logic was checked with sample orders in a script.
