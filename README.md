# Tent House: inventory and order management

A mobile-friendly web app for a tent rental shop. Stack: Next.js (TypeScript) + Tailwind, Supabase (Postgres, Auth, Row-Level Security, Realtime, Storage), hosted on Vercel. This stack fits the job well, so no change was made to your suggestion.

> AI-generated code. Have a developer review it, and test every flow with the sample data before taking real orders.

## What is in the box

| Who | Where | What they can do |
|---|---|---|
| Customer (no login) | `/` | Browse items, pick quantities and dates, send a request (status "Pending approval"). Can order more than stock; never sees an error or stock numbers. |
| Owner | `/admin` | Dashboard, orders (approve / edit / decline), availability by date, inventory, alerts, staff logins, settings. |
| Worker | `/worker` | Today's deliveries and pickups, loading checklist, return checklist, status buttons, quantity edits. Never sees prices. |

## The four phases (one database file each)

| Phase | Database file | App features |
|---|---|---|
| 1 | `supabase/migrations/001_phase1_auth_inventory.sql` | Logins and roles, inventory with photos, staff and settings pages |
| 2 | `002_phase2_orders_availability.sql` | Customer ordering page, availability maths, date view |
| 3 | `003_phase3_approval_shortfall.sql` | Approve/decline/edit, shortfall flags, sourcing, alerts, edit history |
| 4 | `004_phase4_worker_returns.sql` | Worker pages, loading and return checklists, worker edits |
| update | `009_logo.sql` | Logo upload (Settings page). Shown on the customer, tracking, login, owner and worker screens. |
| update | `008_proof_photos_tracking_outstanding.sql` | Camera photo proof at delivery and pickup, partial delivery, items not returned (returning late / missing), customer tracking link and optional pickup request. |
| update | `007_decorations_merge_workers.sql` | Worker mobile numbers, flower-decoration gallery (images only), repeat orders from the same customer merge into one, business name "SLN Tent House". |
| update | `006_kannada_names.sql` | Kannada names for items. Run it, then run `seed.sql` again (safe to re-run; it keeps your quantities and prices). |
| update | `005_groups_variants_transport.sql` | Sizes/options per item (Annada Patre kg sizes, Shamiyana sizes, Bandli normal/Mysorpak), icons, display order, owner-only transport charge. Categories are no longer used. |

Run them in order, 001 to 009. The app screens for later phases need the later database files, so run all nine before using the whole app. If you want to test phase by phase, run 001, start the app, check login and inventory, then add 002, and so on. Pages from phases you have not installed yet will show errors, which is expected.

## Setup, step by step

You need: a computer with Node.js 20 or newer (nodejs.org), a free Supabase account, a free GitHub account and a free Vercel account.

### 1. Create the Supabase project
1. Go to supabase.com, sign in, click **New project**. Pick a name, a strong database password (save it somewhere) and the region closest to you.
2. Wait about two minutes until it finishes setting up.
3. Open **Authentication → Sign In / Providers** (the exact label may vary) and turn **off** "Allow new users to sign up". This stops strangers from creating accounts. Even if left on, new accounts get no access, but turn it off anyway.
4. Open **Project Settings → API** and keep that page open. You need the Project URL, the `anon`/publishable key and the `service_role`/secret key.

### 2. Create the database
1. In Supabase, open **SQL Editor → New query**.
2. Open `supabase/migrations/001_phase1_auth_inventory.sql` from this folder, copy everything, paste, click **Run**. It should say "Success".
3. Repeat for `002`, then `003`, then `004`, one at a time, in that order.

### 3. Create your owner login
1. In Supabase open **Authentication → Users → Add user → Create new user**. Enter your email and a strong password, tick **Auto Confirm User**.
2. Back in **SQL Editor**, run this (use your own email):

```sql
update profiles set role = 'owner'
where id = (select id from auth.users where email = 'you@example.com');
```

3. Worker logins are created later from inside the app (**Staff** page), so you never touch Supabase for that.

### 4. Load your item list
In **SQL Editor** paste and run `supabase/seed.sql` once. It adds the 50 items from your order slip (68 rows, because items with sizes or options have one row per size), each with quantity 0 and price 0.

Then open **Inventory → Quick update all** in the app and type the quantity, damaged count and price per day for every item. Press **Save all** once. Items are shown to customers in the same order as your slip.

If you loaded the earlier demo data, run these three lines first: `delete from alerts; delete from orders; delete from items;`

**Sizes and options.** Each size is a separate stock item so every size has its own quantity: Annada Patre 5 kg to 50 kg, Shamiyana and Pipe Shamiyana in 20x20, 12x20, 10x20, 12x12 and 10x12, and Bandli Big in Normal or Mysorpak. Customers see them together under one heading and can pick, for example, 1 × 25 kg and 2 × 30 kg. To add another option, add an item with the same **Group** name and its own **Size / option**.

**Kannada.** All screen text is English. A small **English / ಕನ್ನಡ** button at the top of the customer and worker pages switches only the **item names** (and decoration names) between English and Kannada, and remembers the choice on that phone. The login page shows both languages. Owner pages stay in English. To change a Kannada item name, edit the item in Inventory (the English name field holds both, e.g. "Big Dabari (ದೊಡ್ಡ ಡಬರಿ)"; the Kannada-only name used on customer and worker screens is refreshed from `seed.sql`).

**Worker login by mobile number.** On the Staff page the owner enters a worker's name, 10-digit mobile number and a password. The worker types the mobile number and password on the login page and sees their name at the top of every screen. (Behind the scenes the app stores a hidden internal address built from the number, so no SMS service is needed.) The owner still logs in with an email.

**Flower decoration.** Under **Decorations** the owner uploads photos of designs. Customers tap the designs they like; no price is shown. The owner opens the order, sees the chosen designs and enters a **Decoration charge** for that order, since the price depends on the season. Workers see the chosen photos on their order page.

**Repeat orders from the same customer.** If a customer sends another request with the same mobile number and the same event dates while their earlier order is still pending or confirmed (not yet loaded), the new items are added to that order instead of creating a second one. The customer is told so, and the owner gets a "Customer added items" alert. Different dates create a new order. The owner can search orders by name or phone, and each order lists the customer's other orders.

**Delivery and pickup with photos.** A worker cannot mark an order Delivered or Picked up without a photo of every item taken with the phone camera (one photo can show the whole stack, for example 50 chairs). The worker enters the quantity delivered; if it is less than ordered, the rest shows as *pending*, the owner is alerted, and the worker can deliver the pending items later with new photos. At pickup the worker enters how many were collected; if fewer, he must choose *returning late* or *missing*. The owner sees all photos with the time on the order page (photos are private; links expire after an hour). The phone's camera opens directly; no browser can fully block the gallery, so the upload time on each photo is shown as a check.

**Items not returned.** Short returns appear under **Not returned** in the owner menu and on the dashboard. Those units stay out of available stock. After the order is checked in at the godown, the owner (or a worker) marks them *received back* (stock is released) or the owner writes them off as *lost* (total stock is reduced). A WhatsApp reminder button is included.

**Customer tracking page and messages.** After ordering, the customer lands on a private page (`/track/...`) showing the order list, status, what was delivered and anything pending, with a Share on WhatsApp button and an optional **Event is over, please pick up** button once items are delivered (a worker can also just call and collect). On each order the owner has WhatsApp buttons (order confirmed, delivery update, pickup, not-returned reminder) that open WhatsApp with an English and Kannada message ready to send. Fully automatic messages need a paid WhatsApp or SMS service and are not included. Set `NEXT_PUBLIC_SITE_URL` to your live address so the links in messages use it.

**Transport.** On each order, the owner enters a **Transport charge** next to the discount. It is added to the total. Workers never see it.

### 5. Run the app on your computer
1. Open a terminal in this folder.
2. Copy `.env.example` to `.env.local` and fill in the three values from Supabase (**Project Settings → API**).
3. Run:

```
npm install
npm run dev
```

4. Open http://localhost:3000. That is the customer page. Staff log in at http://localhost:3000/login.
5. On your phone (same Wi-Fi), open `http://<your-computer-ip>:3000`.

### 6. Put it online with Vercel
1. Create a GitHub repository and upload this folder (do not upload `.env.local`; `.gitignore` already skips it).
2. On vercel.com click **Add New → Project**, import the repository.
3. Under **Environment Variables** add the same three names and values as in `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Click **Deploy**. After about a minute you get a web address. Share that address with customers.
5. In Supabase, **Authentication → URL Configuration**, set the Site URL to your Vercel address.
6. On a phone, open the address and use "Add to Home Screen" for an app-like icon.

### 6b. Use your own domain (for example www.yourshop.com)
1. In Vercel open your project, then **Settings → Domains → Add**, and type your domain (for example `www.yourshop.com`).
2. Vercel shows the DNS records to create. Open the place where you bought the domain (GoDaddy, Namecheap, BigRock, etc.) and add them under DNS settings. Normally this is a `CNAME` record for `www` pointing to the value Vercel shows, and an `A` record for the bare domain (`@`) pointing to the IP Vercel shows. Copy the exact values from Vercel; they can differ per project.
3. Wait until Vercel shows a green tick (usually minutes, sometimes up to a few hours). Vercel adds the HTTPS certificate for free.
4. In Vercel **Settings → Environment Variables** set `NEXT_PUBLIC_SITE_URL=https://www.yourshop.com` (no trailing slash) and redeploy. Links in the WhatsApp messages and tracking page then use your domain. Also set it in `.env.local` if you want the same locally.
5. In Supabase **Authentication → URL Configuration**, set **Site URL** to your domain.

### 6c. Logo
Log in as owner, open **Settings**, and under **Logo** choose an image. It shows at once on the customer page, order tracking page, login page, and the owner and worker headers. Remove it from the same place. Run `009_logo.sql` first.

### 7. First things to do after going live
1. Log in as owner, open **Settings**, set your business name, time zone and the buffer days.
2. Open **Staff** and create a login for each worker.
3. Delete the sample data (if loaded) and add your real items under **Inventory**.
4. Place a test request from the customer page, approve it, and walk it through the worker screens.

## How the rules work

**Availability for a date** = total stock, minus damaged/in-repair units, minus units held by confirmed orders.

- An order holds stock from its start date to its end date plus the buffer days.
- Statuses that hold stock: Confirmed, Loaded, Delivered, Picked up. Pending, Declined, Cancelled, Returned and Closed do not.
- If an order's date has passed but a worker has not checked it in, it keeps holding stock until the check-in (the "Returned to godown" button).
- Remaining can go negative; the Availability page shows "short by N" in red.
- Pending requests are shown beside confirmed bookings (Pending column, with a warning if approving would cause a shortage) but never reserve stock.

**Shortfall and sourcing.** For every pending or confirmed order the database works out the worst day across its dates. If your own stock cannot cover it, the order shows "Needs sourcing", and you get an alert (new request, approval, any edit, any stock change). On the order page you record supplier, quantity and cost; those units stop counting against your stock and the flag clears once the shortage is covered. At check-in, sourced units are treated as going back to the supplier, never into your stock.

**Returns.** The worker enters how many came back good and how many are damaged; missing is calculated. Damaged units move to "damaged/in repair" (release them in Inventory after repair), missing units are removed from total stock, and you get an alert. Damaged or missing units beyond the number of your own units on the order are assumed to belong to the supplier and are flagged in the alert.

**Worker edits.** Every quantity change is stored (who, what, when) in the order History, creates an alert for the owner, and triggers a shortfall check. Increasing a quantity un-ticks that line on the loading checklist so the extra units get loaded.

**Order flow.** Pending approval → Confirmed → Loaded → Delivered → Picked up → Returned → Closed, plus Declined and Cancelled. The database refuses any other jump, and refuses "Loaded" or "Delivered" while loading checklist items are unticked (when a worker presses it).

## Security design

- Passwords are handled by Supabase Auth (hashed, never stored by this app).
- Every table has Row-Level Security. A worker's login physically cannot read price tables, edit history, alerts, sourcing costs or other staff. Prices live in their own tables (`item_prices`, `order_item_prices`, `order_prices`) because Postgres cannot hide single columns.
- Workers cannot write to tables at all. Their changes go through database functions that check the role, the order status and the rules, and write the history.
- Customers never touch tables. They can call only three functions: `public_catalog`, `public_info`, `submit_order`.
- The role is set in a protected field (`app_metadata`) that users cannot edit. New sign-ups get role `none` (no access).
- The service-role key is used only by the Staff page, and only after the server confirms you are the owner.
- Prices shown to customers are public by design. Turn this off in Settings if you prefer to quote by phone.

## Known limits and ideas for later

- Alerts appear in the app instantly while it is open (live updates). There is no email, SMS or WhatsApp push yet.
- The public order form has a hidden spam trap but no CAPTCHA. If you receive spam, add Cloudflare Turnstile or turn on Vercel's bot protection.
- Customers get a reference number but no tracking page.
- The buffer day is applied after the event only.
- Availability for past dates reflects today's order statuses, not history.
- Test the SQL on a copy first: it was written carefully but could not be run against a live database in the environment where this was generated.
