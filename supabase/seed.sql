-- =====================================================================
-- ITEM CATALOGUE from the shop's order slip, with Kannada names.
-- Run AFTER migrations 001-006. Safe to run again: items that already exist
-- are kept (quantities and prices untouched) and only their names, groups
-- and Kannada text are refreshed.
--
-- New items start with quantity 0 and price 0: fill them in with
-- Inventory -> "Quick update all" in the app.
--
-- If you loaded the earlier demo data, clear it FIRST (run separately):
--   delete from alerts;
--   delete from orders;
--   delete from items;
-- =====================================================================

-- 1) add items that are missing (quantity 0)
insert into items (group_name, group_name_kn, variant_label, variant_label_kn, name, name_kn, emoji, sort_order, total_qty)
select s.grp, s.grp_kn, s.variant, s.variant_kn, s.name, s.name_kn, s.emoji, s.ord, 0
from (values
  (1, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '5 kg', '5 ಕೆಜಿ', 'Annada Patre 5 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 5 ಕೆಜಿ', '🍲'),
  (2, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '10 kg', '10 ಕೆಜಿ', 'Annada Patre 10 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 10 ಕೆಜಿ', '🍲'),
  (3, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '15 kg', '15 ಕೆಜಿ', 'Annada Patre 15 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 15 ಕೆಜಿ', '🍲'),
  (4, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '20 kg', '20 ಕೆಜಿ', 'Annada Patre 20 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 20 ಕೆಜಿ', '🍲'),
  (5, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '25 kg', '25 ಕೆಜಿ', 'Annada Patre 25 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 25 ಕೆಜಿ', '🍲'),
  (6, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '30 kg', '30 ಕೆಜಿ', 'Annada Patre 30 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 30 ಕೆಜಿ', '🍲'),
  (7, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '35 kg', '35 ಕೆಜಿ', 'Annada Patre 35 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 35 ಕೆಜಿ', '🍲'),
  (8, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '40 kg', '40 ಕೆಜಿ', 'Annada Patre 40 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 40 ಕೆಜಿ', '🍲'),
  (9, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '45 kg', '45 ಕೆಜಿ', 'Annada Patre 45 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 45 ಕೆಜಿ', '🍲'),
  (10, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '50 kg', '50 ಕೆಜಿ', 'Annada Patre 50 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 50 ಕೆಜಿ', '🍲'),
  (11, null, null, null, null, 'Big Dabari (ದೊಡ್ಡ ಡಬರಿ)', 'ದೊಡ್ಡ ಡಬರಿ', '🥘'),
  (12, null, null, null, null, 'Medium Dabari (ಮೀಡಿಯಂ ಡಬರಿ)', 'ಮೀಡಿಯಂ ಡಬರಿ', '🥘'),
  (13, null, null, null, null, 'Small Dabari (ಸಣ್ಣ ಡಬರಿ)', 'ಸಣ್ಣ ಡಬರಿ', '🥘'),
  (14, null, null, null, null, 'Kolaga (ಕೊಳಗ)', 'ಕೊಳಗ', '🪣'),
  (15, null, null, null, null, 'Plates (ತಟ್ಟೆಗಳು)', 'ತಟ್ಟೆಗಳು', '🍽️'),
  (16, null, null, null, null, 'Parota Plates (ಪರೋಟ ತಟ್ಟೆಗಳು)', 'ಪರೋಟ ತಟ್ಟೆಗಳು', '🍽️'),
  (17, null, null, null, null, 'Steel Bucket (ಸ್ಟೀಲ್ ಬಕೀಟು)', 'ಸ್ಟೀಲ್ ಬಕೀಟು', '🪣'),
  (18, null, null, null, null, 'Steel Basin (ಸ್ಟೀಲ್ ಬೇಸಿನ್)', 'ಸ್ಟೀಲ್ ಬೇಸಿನ್', '🥣'),
  (19, null, null, null, null, 'Water Jug (ನೀರಿನ ಜಗ್ಗು)', 'ನೀರಿನ ಜಗ್ಗು', '🫗'),
  (20, null, null, null, null, 'Steel Sowma (ಸ್ಟೀಲ್ ಸೌಮ)', 'ಸ್ಟೀಲ್ ಸೌಮ', '🥄'),
  (21, null, null, null, null, 'Steel Rice Ladle (ಸ್ಟೀಲ್ ಅನ್ನದಕೈ)', 'ಸ್ಟೀಲ್ ಅನ್ನದಕೈ', '🥄'),
  (22, null, null, null, null, 'Kai Batlu (ಕೈ ಬಟ್ಲು)', 'ಕೈ ಬಟ್ಲು', '🥣'),
  (23, 'Bandli Big (ಬಾಂಡ್ಲಿ ದೊಡ್ಡದು)', 'ಬಾಂಡ್ಲಿ ದೊಡ್ಡದು', 'Normal', 'ಸಾಮಾನ್ಯ', 'Bandli Big Normal', 'ಬಾಂಡ್ಲಿ ದೊಡ್ಡದು ಸಾಮಾನ್ಯ', '🍳'),
  (24, 'Bandli Big (ಬಾಂಡ್ಲಿ ದೊಡ್ಡದು)', 'ಬಾಂಡ್ಲಿ ದೊಡ್ಡದು', 'Mysorpak', 'ಮೈಸೂರುಪಾಕ್', 'Bandli Big Mysorpak', 'ಬಾಂಡ್ಲಿ ದೊಡ್ಡದು ಮೈಸೂರುಪಾಕ್', '🍳'),
  (25, null, null, null, null, 'Kumma Big (ಕುಮ್ಮ ದೊಡ್ಡದು)', 'ಕುಮ್ಮ ದೊಡ್ಡದು', '🥘'),
  (26, null, null, null, null, 'Boondi Strainer (ಬೂಂದಿ ಜಾಲರ)', 'ಬೂಂದಿ ಜಾಲರ', '🥢'),
  (27, null, null, null, null, 'Oil Strainer (ಎಣ್ಣೆ ಜಾಲರ)', 'ಎಣ್ಣೆ ಜಾಲರ', '🥢'),
  (28, null, null, null, null, 'Hand Strainer (ಕೈ ಜಾಲರ)', 'ಕೈ ಜಾಲರ', '🥢'),
  (29, null, null, null, null, 'Kurupi (ಕುರಿಪಿ)', 'ಕುರಿಪಿ', '🥄'),
  (30, null, null, null, null, 'Fresh Coconut Grater (ಹಸಿಕೊಬ್ಬರಿ ತುರಿಮಣಿ)', 'ಹಸಿಕೊಬ್ಬರಿ ತುರಿಮಣಿ', '🥥'),
  (31, null, null, null, null, 'Dry Coconut Grater (ಒಣಕೊಬ್ಬರಿ ತುರಿಮಣಿ)', 'ಒಣಕೊಬ್ಬರಿ ತುರಿಮಣಿ', '🥥'),
  (32, null, null, null, null, 'Gas Stoves (ಗ್ಯಾಸ್ ಸ್ಟವ್ ಗಳು)', 'ಗ್ಯಾಸ್ ಸ್ಟವ್ ಗಳು', '🔥'),
  (33, null, null, null, null, 'Mysorepak Tray (ಮೈಸೂರುಪಾಕ್ ಟ್ರೇ)', 'ಮೈಸೂರುಪಾಕ್ ಟ್ರೇ', '🍮'),
  (34, null, null, null, null, 'Jamkhana (ಜಮಖಾನೆ)', 'ಜಮಖಾನೆ', '🟫'),
  (35, null, null, null, null, 'Tarpaulin (ಟಾರ್ಪಾಲ್)', 'ಟಾರ್ಪಾಲ್', '🟦'),
  (36, null, null, null, null, 'Dining Mat (ಊಟದ ಚಾಪೆ)', 'ಊಟದ ಚಾಪೆ', '🟫'),
  (37, null, null, null, null, 'Tables (ಟೇಬಲ್ಸ್)', 'ಟೇಬಲ್ಸ್', '🪑'),
  (38, null, null, null, null, 'Plastic Chairs (ಪ್ಲಾಸ್ಟಿಕ್ ಚೇರ್ಸ್)', 'ಪ್ಲಾಸ್ಟಿಕ್ ಚೇರ್ಸ್', '🪑'),
  (39, 'Shamiyana (ಶಾಮಿಯಾನ)', 'ಶಾಮಿಯಾನ', '20x20', '20x20 ಅಡಿ', 'Shamiyana 20x20 ft', 'ಶಾಮಿಯಾನ 20x20 ಅಡಿ', '⛺'),
  (40, 'Shamiyana (ಶಾಮಿಯಾನ)', 'ಶಾಮಿಯಾನ', '12x20', '12x20 ಅಡಿ', 'Shamiyana 12x20 ft', 'ಶಾಮಿಯಾನ 12x20 ಅಡಿ', '⛺'),
  (41, 'Shamiyana (ಶಾಮಿಯಾನ)', 'ಶಾಮಿಯಾನ', '10x20', '10x20 ಅಡಿ', 'Shamiyana 10x20 ft', 'ಶಾಮಿಯಾನ 10x20 ಅಡಿ', '⛺'),
  (42, 'Shamiyana (ಶಾಮಿಯಾನ)', 'ಶಾಮಿಯಾನ', '12x12', '12x12 ಅಡಿ', 'Shamiyana 12x12 ft', 'ಶಾಮಿಯಾನ 12x12 ಅಡಿ', '⛺'),
  (43, 'Shamiyana (ಶಾಮಿಯಾನ)', 'ಶಾಮಿಯಾನ', '10x12', '10x12 ಅಡಿ', 'Shamiyana 10x12 ft', 'ಶಾಮಿಯಾನ 10x12 ಅಡಿ', '⛺'),
  (44, null, null, null, null, 'Side Wall (ಸೈಡ್ ವಾಲ್)', 'ಸೈಡ್ ವಾಲ್', '🧱'),
  (45, null, null, null, null, 'Water Drum (ನೀರಿನ ಡ್ರಂ)', 'ನೀರಿನ ಡ್ರಂ', '🛢️'),
  (46, null, null, null, null, 'Maharani Chairs (ಮಹಾರಾಣಿ ಚೇರ್ಸ್)', 'ಮಹಾರಾಣಿ ಚೇರ್ಸ್', '👑'),
  (47, null, null, null, null, 'Hunase Jalladi (ಹುಣಸೆ ಜಲ್ಲಿಡಿ)', 'ಹುಣಸೆ ಜಲ್ಲಿಡಿ', '🥢'),
  (48, null, null, null, null, 'Gas Light (ಗ್ಯಾಸ್ ಲೈಟ್)', 'ಗ್ಯಾಸ್ ಲೈಟ್', '💡'),
  (49, null, null, null, null, 'Stage (ಸ್ಟೇಜ್)', 'ಸ್ಟೇಜ್', '🎭'),
  (50, null, null, null, null, 'Screen (ಸ್ಕ್ರೀನ್)', 'ಸ್ಕ್ರೀನ್', '🖼️'),
  (51, null, null, null, null, 'Gold Covering Jewellery (ಗೋಲ್ಡ್ ಕವರಿಂಗ್ ಒಡವೆಗಳು)', 'ಗೋಲ್ಡ್ ಕವರಿಂಗ್ ಒಡವೆಗಳು', '💍'),
  (52, null, null, null, null, 'Grinder (ಗ್ರೈಂಡರ್)', 'ಗ್ರೈಂಡರ್', '⚙️'),
  (53, null, null, null, null, 'Peta (ಪೇಟ)', 'ಪೇಟ', '👳'),
  (54, null, null, null, null, 'Poilu (ಪೊಯಿಲು)', 'ಪೊಯಿಲು', '📦'),
  (55, null, null, null, null, 'Mekulu (ಮೇಕುಲು)', 'ಮೇಕುಲು', '📌'),
  (56, null, null, null, null, 'Kabbilu (ಕಬ್ಬಿಲು)', 'ಕಬ್ಬಿಲು', '📦'),
  (57, null, null, null, null, 'Steel Plates (ಸ್ಟೀಲ್ ಪ್ಲೇಟ್ಸ್)', 'ಸ್ಟೀಲ್ ಪ್ಲೇಟ್ಸ್', '🍽️'),
  (58, null, null, null, null, 'Stage Pipes (ಸ್ಟೇಜ್ ಪೈಪುಗಳು)', 'ಸ್ಟೇಜ್ ಪೈಪುಗಳು', '🔩'),
  (59, null, null, null, null, 'Carpet (ಕಾರ್ಪೆಟ್)', 'ಕಾರ್ಪೆಟ್', '🟥'),
  (60, 'Pipe Shamiyana (ಪೈಪ್ ಶಾಮಿಯಾನ)', 'ಪೈಪ್ ಶಾಮಿಯಾನ', '20x20', '20x20 ಅಡಿ', 'Pipe Shamiyana 20x20 ft', 'ಪೈಪ್ ಶಾಮಿಯಾನ 20x20 ಅಡಿ', '⛺'),
  (61, 'Pipe Shamiyana (ಪೈಪ್ ಶಾಮಿಯಾನ)', 'ಪೈಪ್ ಶಾಮಿಯಾನ', '12x20', '12x20 ಅಡಿ', 'Pipe Shamiyana 12x20 ft', 'ಪೈಪ್ ಶಾಮಿಯಾನ 12x20 ಅಡಿ', '⛺'),
  (62, 'Pipe Shamiyana (ಪೈಪ್ ಶಾಮಿಯಾನ)', 'ಪೈಪ್ ಶಾಮಿಯಾನ', '10x20', '10x20 ಅಡಿ', 'Pipe Shamiyana 10x20 ft', 'ಪೈಪ್ ಶಾಮಿಯಾನ 10x20 ಅಡಿ', '⛺'),
  (63, 'Pipe Shamiyana (ಪೈಪ್ ಶಾಮಿಯಾನ)', 'ಪೈಪ್ ಶಾಮಿಯಾನ', '12x12', '12x12 ಅಡಿ', 'Pipe Shamiyana 12x12 ft', 'ಪೈಪ್ ಶಾಮಿಯಾನ 12x12 ಅಡಿ', '⛺'),
  (64, 'Pipe Shamiyana (ಪೈಪ್ ಶಾಮಿಯಾನ)', 'ಪೈಪ್ ಶಾಮಿಯಾನ', '10x12', '10x12 ಅಡಿ', 'Pipe Shamiyana 10x12 ft', 'ಪೈಪ್ ಶಾಮಿಯಾನ 10x12 ಅಡಿ', '⛺'),
  (65, null, null, null, null, 'Mat (ಮ್ಯಾಟ್)', 'ಮ್ಯಾಟ್', '🟫'),
  (66, null, null, null, null, 'Holige Set (ಹೋಳಿಗೆ ಸೆಟ್)', 'ಹೋಳಿಗೆ ಸೆಟ್', '🍽️'),
  (67, null, null, null, null, 'Name Board (ನೇಮ್ ಬೋರ್ಡ್)', 'ನೇಮ್ ಬೋರ್ಡ್', '🪧'),
  (68, null, null, null, null, 'Flower Decoration (ಫ್ಲವರ್ ಡೆಕೋರೇಶನ್)', 'ಫ್ಲವರ್ ಡೆಕೋರೇಶನ್', '💐')
) as s(ord, grp, grp_kn, variant, variant_kn, name, name_kn, emoji)
where not exists (select 1 from items i where i.name = s.name);

-- 2) refresh names, groups, Kannada text and order for every slip item
update items i
   set group_name = s.grp, group_name_kn = s.grp_kn,
       variant_label = s.variant, variant_label_kn = s.variant_kn,
       name_kn = s.name_kn, emoji = coalesce(i.emoji, s.emoji), sort_order = s.ord
  from (values
  (1, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '5 kg', '5 ಕೆಜಿ', 'Annada Patre 5 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 5 ಕೆಜಿ', '🍲'),
  (2, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '10 kg', '10 ಕೆಜಿ', 'Annada Patre 10 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 10 ಕೆಜಿ', '🍲'),
  (3, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '15 kg', '15 ಕೆಜಿ', 'Annada Patre 15 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 15 ಕೆಜಿ', '🍲'),
  (4, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '20 kg', '20 ಕೆಜಿ', 'Annada Patre 20 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 20 ಕೆಜಿ', '🍲'),
  (5, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '25 kg', '25 ಕೆಜಿ', 'Annada Patre 25 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 25 ಕೆಜಿ', '🍲'),
  (6, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '30 kg', '30 ಕೆಜಿ', 'Annada Patre 30 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 30 ಕೆಜಿ', '🍲'),
  (7, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '35 kg', '35 ಕೆಜಿ', 'Annada Patre 35 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 35 ಕೆಜಿ', '🍲'),
  (8, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '40 kg', '40 ಕೆಜಿ', 'Annada Patre 40 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 40 ಕೆಜಿ', '🍲'),
  (9, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '45 kg', '45 ಕೆಜಿ', 'Annada Patre 45 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 45 ಕೆಜಿ', '🍲'),
  (10, 'Annada Patre (ಅನ್ನದ ಪಾತ್ರೆ)', 'ಅನ್ನದ ಪಾತ್ರೆ', '50 kg', '50 ಕೆಜಿ', 'Annada Patre 50 kg', 'ಅನ್ನದ ಪಾತ್ರೆ 50 ಕೆಜಿ', '🍲'),
  (11, null, null, null, null, 'Big Dabari (ದೊಡ್ಡ ಡಬರಿ)', 'ದೊಡ್ಡ ಡಬರಿ', '🥘'),
  (12, null, null, null, null, 'Medium Dabari (ಮೀಡಿಯಂ ಡಬರಿ)', 'ಮೀಡಿಯಂ ಡಬರಿ', '🥘'),
  (13, null, null, null, null, 'Small Dabari (ಸಣ್ಣ ಡಬರಿ)', 'ಸಣ್ಣ ಡಬರಿ', '🥘'),
  (14, null, null, null, null, 'Kolaga (ಕೊಳಗ)', 'ಕೊಳಗ', '🪣'),
  (15, null, null, null, null, 'Plates (ತಟ್ಟೆಗಳು)', 'ತಟ್ಟೆಗಳು', '🍽️'),
  (16, null, null, null, null, 'Parota Plates (ಪರೋಟ ತಟ್ಟೆಗಳು)', 'ಪರೋಟ ತಟ್ಟೆಗಳು', '🍽️'),
  (17, null, null, null, null, 'Steel Bucket (ಸ್ಟೀಲ್ ಬಕೀಟು)', 'ಸ್ಟೀಲ್ ಬಕೀಟು', '🪣'),
  (18, null, null, null, null, 'Steel Basin (ಸ್ಟೀಲ್ ಬೇಸಿನ್)', 'ಸ್ಟೀಲ್ ಬೇಸಿನ್', '🥣'),
  (19, null, null, null, null, 'Water Jug (ನೀರಿನ ಜಗ್ಗು)', 'ನೀರಿನ ಜಗ್ಗು', '🫗'),
  (20, null, null, null, null, 'Steel Sowma (ಸ್ಟೀಲ್ ಸೌಮ)', 'ಸ್ಟೀಲ್ ಸೌಮ', '🥄'),
  (21, null, null, null, null, 'Steel Rice Ladle (ಸ್ಟೀಲ್ ಅನ್ನದಕೈ)', 'ಸ್ಟೀಲ್ ಅನ್ನದಕೈ', '🥄'),
  (22, null, null, null, null, 'Kai Batlu (ಕೈ ಬಟ್ಲು)', 'ಕೈ ಬಟ್ಲು', '🥣'),
  (23, 'Bandli Big (ಬಾಂಡ್ಲಿ ದೊಡ್ಡದು)', 'ಬಾಂಡ್ಲಿ ದೊಡ್ಡದು', 'Normal', 'ಸಾಮಾನ್ಯ', 'Bandli Big Normal', 'ಬಾಂಡ್ಲಿ ದೊಡ್ಡದು ಸಾಮಾನ್ಯ', '🍳'),
  (24, 'Bandli Big (ಬಾಂಡ್ಲಿ ದೊಡ್ಡದು)', 'ಬಾಂಡ್ಲಿ ದೊಡ್ಡದು', 'Mysorpak', 'ಮೈಸೂರುಪಾಕ್', 'Bandli Big Mysorpak', 'ಬಾಂಡ್ಲಿ ದೊಡ್ಡದು ಮೈಸೂರುಪಾಕ್', '🍳'),
  (25, null, null, null, null, 'Kumma Big (ಕುಮ್ಮ ದೊಡ್ಡದು)', 'ಕುಮ್ಮ ದೊಡ್ಡದು', '🥘'),
  (26, null, null, null, null, 'Boondi Strainer (ಬೂಂದಿ ಜಾಲರ)', 'ಬೂಂದಿ ಜಾಲರ', '🥢'),
  (27, null, null, null, null, 'Oil Strainer (ಎಣ್ಣೆ ಜಾಲರ)', 'ಎಣ್ಣೆ ಜಾಲರ', '🥢'),
  (28, null, null, null, null, 'Hand Strainer (ಕೈ ಜಾಲರ)', 'ಕೈ ಜಾಲರ', '🥢'),
  (29, null, null, null, null, 'Kurupi (ಕುರಿಪಿ)', 'ಕುರಿಪಿ', '🥄'),
  (30, null, null, null, null, 'Fresh Coconut Grater (ಹಸಿಕೊಬ್ಬರಿ ತುರಿಮಣಿ)', 'ಹಸಿಕೊಬ್ಬರಿ ತುರಿಮಣಿ', '🥥'),
  (31, null, null, null, null, 'Dry Coconut Grater (ಒಣಕೊಬ್ಬರಿ ತುರಿಮಣಿ)', 'ಒಣಕೊಬ್ಬರಿ ತುರಿಮಣಿ', '🥥'),
  (32, null, null, null, null, 'Gas Stoves (ಗ್ಯಾಸ್ ಸ್ಟವ್ ಗಳು)', 'ಗ್ಯಾಸ್ ಸ್ಟವ್ ಗಳು', '🔥'),
  (33, null, null, null, null, 'Mysorepak Tray (ಮೈಸೂರುಪಾಕ್ ಟ್ರೇ)', 'ಮೈಸೂರುಪಾಕ್ ಟ್ರೇ', '🍮'),
  (34, null, null, null, null, 'Jamkhana (ಜಮಖಾನೆ)', 'ಜಮಖಾನೆ', '🟫'),
  (35, null, null, null, null, 'Tarpaulin (ಟಾರ್ಪಾಲ್)', 'ಟಾರ್ಪಾಲ್', '🟦'),
  (36, null, null, null, null, 'Dining Mat (ಊಟದ ಚಾಪೆ)', 'ಊಟದ ಚಾಪೆ', '🟫'),
  (37, null, null, null, null, 'Tables (ಟೇಬಲ್ಸ್)', 'ಟೇಬಲ್ಸ್', '🪑'),
  (38, null, null, null, null, 'Plastic Chairs (ಪ್ಲಾಸ್ಟಿಕ್ ಚೇರ್ಸ್)', 'ಪ್ಲಾಸ್ಟಿಕ್ ಚೇರ್ಸ್', '🪑'),
  (39, 'Shamiyana (ಶಾಮಿಯಾನ)', 'ಶಾಮಿಯಾನ', '20x20', '20x20 ಅಡಿ', 'Shamiyana 20x20 ft', 'ಶಾಮಿಯಾನ 20x20 ಅಡಿ', '⛺'),
  (40, 'Shamiyana (ಶಾಮಿಯಾನ)', 'ಶಾಮಿಯಾನ', '12x20', '12x20 ಅಡಿ', 'Shamiyana 12x20 ft', 'ಶಾಮಿಯಾನ 12x20 ಅಡಿ', '⛺'),
  (41, 'Shamiyana (ಶಾಮಿಯಾನ)', 'ಶಾಮಿಯಾನ', '10x20', '10x20 ಅಡಿ', 'Shamiyana 10x20 ft', 'ಶಾಮಿಯಾನ 10x20 ಅಡಿ', '⛺'),
  (42, 'Shamiyana (ಶಾಮಿಯಾನ)', 'ಶಾಮಿಯಾನ', '12x12', '12x12 ಅಡಿ', 'Shamiyana 12x12 ft', 'ಶಾಮಿಯಾನ 12x12 ಅಡಿ', '⛺'),
  (43, 'Shamiyana (ಶಾಮಿಯಾನ)', 'ಶಾಮಿಯಾನ', '10x12', '10x12 ಅಡಿ', 'Shamiyana 10x12 ft', 'ಶಾಮಿಯಾನ 10x12 ಅಡಿ', '⛺'),
  (44, null, null, null, null, 'Side Wall (ಸೈಡ್ ವಾಲ್)', 'ಸೈಡ್ ವಾಲ್', '🧱'),
  (45, null, null, null, null, 'Water Drum (ನೀರಿನ ಡ್ರಂ)', 'ನೀರಿನ ಡ್ರಂ', '🛢️'),
  (46, null, null, null, null, 'Maharani Chairs (ಮಹಾರಾಣಿ ಚೇರ್ಸ್)', 'ಮಹಾರಾಣಿ ಚೇರ್ಸ್', '👑'),
  (47, null, null, null, null, 'Hunase Jalladi (ಹುಣಸೆ ಜಲ್ಲಿಡಿ)', 'ಹುಣಸೆ ಜಲ್ಲಿಡಿ', '🥢'),
  (48, null, null, null, null, 'Gas Light (ಗ್ಯಾಸ್ ಲೈಟ್)', 'ಗ್ಯಾಸ್ ಲೈಟ್', '💡'),
  (49, null, null, null, null, 'Stage (ಸ್ಟೇಜ್)', 'ಸ್ಟೇಜ್', '🎭'),
  (50, null, null, null, null, 'Screen (ಸ್ಕ್ರೀನ್)', 'ಸ್ಕ್ರೀನ್', '🖼️'),
  (51, null, null, null, null, 'Gold Covering Jewellery (ಗೋಲ್ಡ್ ಕವರಿಂಗ್ ಒಡವೆಗಳು)', 'ಗೋಲ್ಡ್ ಕವರಿಂಗ್ ಒಡವೆಗಳು', '💍'),
  (52, null, null, null, null, 'Grinder (ಗ್ರೈಂಡರ್)', 'ಗ್ರೈಂಡರ್', '⚙️'),
  (53, null, null, null, null, 'Peta (ಪೇಟ)', 'ಪೇಟ', '👳'),
  (54, null, null, null, null, 'Poilu (ಪೊಯಿಲು)', 'ಪೊಯಿಲು', '📦'),
  (55, null, null, null, null, 'Mekulu (ಮೇಕುಲು)', 'ಮೇಕುಲು', '📌'),
  (56, null, null, null, null, 'Kabbilu (ಕಬ್ಬಿಲು)', 'ಕಬ್ಬಿಲು', '📦'),
  (57, null, null, null, null, 'Steel Plates (ಸ್ಟೀಲ್ ಪ್ಲೇಟ್ಸ್)', 'ಸ್ಟೀಲ್ ಪ್ಲೇಟ್ಸ್', '🍽️'),
  (58, null, null, null, null, 'Stage Pipes (ಸ್ಟೇಜ್ ಪೈಪುಗಳು)', 'ಸ್ಟೇಜ್ ಪೈಪುಗಳು', '🔩'),
  (59, null, null, null, null, 'Carpet (ಕಾರ್ಪೆಟ್)', 'ಕಾರ್ಪೆಟ್', '🟥'),
  (60, 'Pipe Shamiyana (ಪೈಪ್ ಶಾಮಿಯಾನ)', 'ಪೈಪ್ ಶಾಮಿಯಾನ', '20x20', '20x20 ಅಡಿ', 'Pipe Shamiyana 20x20 ft', 'ಪೈಪ್ ಶಾಮಿಯಾನ 20x20 ಅಡಿ', '⛺'),
  (61, 'Pipe Shamiyana (ಪೈಪ್ ಶಾಮಿಯಾನ)', 'ಪೈಪ್ ಶಾಮಿಯಾನ', '12x20', '12x20 ಅಡಿ', 'Pipe Shamiyana 12x20 ft', 'ಪೈಪ್ ಶಾಮಿಯಾನ 12x20 ಅಡಿ', '⛺'),
  (62, 'Pipe Shamiyana (ಪೈಪ್ ಶಾಮಿಯಾನ)', 'ಪೈಪ್ ಶಾಮಿಯಾನ', '10x20', '10x20 ಅಡಿ', 'Pipe Shamiyana 10x20 ft', 'ಪೈಪ್ ಶಾಮಿಯಾನ 10x20 ಅಡಿ', '⛺'),
  (63, 'Pipe Shamiyana (ಪೈಪ್ ಶಾಮಿಯಾನ)', 'ಪೈಪ್ ಶಾಮಿಯಾನ', '12x12', '12x12 ಅಡಿ', 'Pipe Shamiyana 12x12 ft', 'ಪೈಪ್ ಶಾಮಿಯಾನ 12x12 ಅಡಿ', '⛺'),
  (64, 'Pipe Shamiyana (ಪೈಪ್ ಶಾಮಿಯಾನ)', 'ಪೈಪ್ ಶಾಮಿಯಾನ', '10x12', '10x12 ಅಡಿ', 'Pipe Shamiyana 10x12 ft', 'ಪೈಪ್ ಶಾಮಿಯಾನ 10x12 ಅಡಿ', '⛺'),
  (65, null, null, null, null, 'Mat (ಮ್ಯಾಟ್)', 'ಮ್ಯಾಟ್', '🟫'),
  (66, null, null, null, null, 'Holige Set (ಹೋಳಿಗೆ ಸೆಟ್)', 'ಹೋಳಿಗೆ ಸೆಟ್', '🍽️'),
  (67, null, null, null, null, 'Name Board (ನೇಮ್ ಬೋರ್ಡ್)', 'ನೇಮ್ ಬೋರ್ಡ್', '🪧'),
  (68, null, null, null, null, 'Flower Decoration (ಫ್ಲವರ್ ಡೆಕೋರೇಶನ್)', 'ಫ್ಲವರ್ ಡೆಕೋರೇಶನ್', '💐')
) as s(ord, grp, grp_kn, variant, variant_kn, name, name_kn, emoji)
 where i.name = s.name;

-- 3) a price row for every item (0 = not set yet)
insert into item_prices (item_id, price_per_day)
select id, 0 from items
on conflict (item_id) do nothing;
