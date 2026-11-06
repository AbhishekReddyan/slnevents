# Replace old code with this full version

## A. Replace the code (on your computer)
1. Keep a copy of your current `.env.local` file (it holds your Supabase keys). Copy it somewhere safe.
2. Delete the old project folder contents (or the whole folder).
3. Unzip `tenthouse.zip`. You get a folder named `tenthouse`.
4. Put your saved `.env.local` inside the new `tenthouse` folder (same level as `package.json`). If you have none, copy `.env.example` to `.env.local` and fill in the 3 Supabase values.
5. In a terminal inside the folder run:
   npm install
   npm run dev
6. Open http://localhost:3000 to test.

## B. Update the database (Supabase, SQL Editor)
Your database already has some migrations. Run only the ones it is missing, in number order, one at a time (New query, paste, Run).

- If you already ran 001 to 008: run only `009_logo.sql`.
- If unsure which you ran: 001 to 008 are safe to check by looking at the Table Editor. Tables `outstanding_items` and `order_item_photos` mean 008 is done. Table `decorations` means 007 is done. Column `name_kn` on `items` means 006 is done.
- Fresh empty database: run 001, 002, 003, 004, 005, 006, 007, 008, 009 in that order, then `seed.sql` once, then create the owner login (README step 3).
- After any new migration, run `seed.sql` again only if you want Kannada names refreshed. It keeps your quantities and prices.

## C. Storage buckets
Created automatically by 001 (`item-photos`, public) and 008 (`proof-photos`, private). Check Storage in Supabase shows both.

## D. Test checklist
1. Owner: log in at /login, open Settings, upload the logo. Tab icon and headers show it.
2. Owner: Staff, add a worker with name, 10-digit mobile and password.
3. Inventory: Quick update, enter quantities and prices.
4. Customer (private window): place an order at /. You land on the tracking page.
5. Owner: open the order, Approve. Use "Message the customer" (try the Send to box).
6. Worker (phone, mobile + password): tick loading, Mark loaded, then Delivery with a camera photo per item, then Pickup, then check in.
7. Place a second order with the same phone and same dates: it should merge.

## E. Go live
Push to GitHub, Vercel redeploys. Add domain (README 6b) and set NEXT_PUBLIC_SITE_URL.
Never upload `.env.local` to GitHub (`.gitignore` already skips it).
