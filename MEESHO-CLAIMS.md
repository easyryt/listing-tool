# Meesho claims and local evidence

Open `/claims` from **Meesho claims** in the app navigation. Add the sub-order number, AWB, actual packet condition, Packet ID (or `NA` only when unavailable), issue and description. A callback number may be entered; otherwise the extension retains Meesho's existing saved number. The observed Meesho form requires a valid callback number.

## Reading label photos

Choose **Upload shipping label**, or **Read photo** beside Sub-order number, AWB number or Packet ID. One photo can identify all three fields when their printed labels are present. Recognition runs on the device with Tesseract.js; the worker, WASM and English model are served by this app. Photo bytes are not sent to an OCR service. The reader loads only when a photo is chosen. PNG, JPG and WebP scans up to 10 MB are supported, with progress and cancellation.

Clear, unique labelled matches fill empty fields. Existing values, multiple matches and unclear results require an explicit **Use number** choice. An unlabelled product barcode is shown separately and is never automatically treated as an AWB or sub-order. Review every detected number against the photo. Label scans are temporary reading aids; save the resulting numbers with the draft and add original claim evidence in step 2. The actual packet condition is always selected by the user.

Separated sub-order digits require manual review: OCR can mistake the underscore before an item suffix for a space. The reader warns about that case and never silently concatenates those groups into a different order number.

`npm run prepare:ocr` copies the installed OCR assets into the generated, ignored `public/claims-ocr` directory. The dev and build scripts run this automatically. Install dependencies before building; deployments must include these generated public assets. No extension update or new Chrome permission is needed for photo recognition.

Add the original unboxing MP4, product-received photo and reverse waybill photo. A barcode image is optional. Save the draft to keep the evidence in IndexedDB on the current browser, device and site origin. These files are not uploaded to the app backend or downloaded as staging copies. Clearing site data, switching browsers or switching app domains does not preserve access to the same local store. Keep original files. Local app limits are 100 MB for MP4 and 10 MB per PNG/JPG; Meesho validates its current limits independently.

The linked official recording guide is `https://www.youtube.com/watch?v=16RCb7sDQx4`. It recommends one continuous unedited recording, clear light, all sides of the unopened parcel, readable label/AWB/barcode, and then opening and showing the returned item. Its suggested recording length is 60–80 seconds. The app preserves original video bytes; it never edits, trims or converts evidence.

**Watch guide here** opens that same official video inline. The YouTube player loads only after that button is selected; the direct YouTube link remains available.

## Extension setup

Update the unpacked extension using this repository's `browser-extension` folder, or extract `public/listing-meesho-extension.zip` into the installed extension folder. Reload **Browser AI Test — Local Listing Assistant**, confirm version **0.11.1**, then refresh the listing page. Existing site permissions cover the supported listing origins and `supplier.meesho.com`; this feature adds no Chrome permissions. Keep one copy enabled. The active browser tool blocks protected extension settings, so installing/reloading requires the user.

Version 0.11.1 waits for Meesho's ticket fields after navigation. Meesho can reach the `/create` route while still showing its loading screen; missing fields during that interval are treated as loading until the existing timeout, without writing data to an incomplete form.

## Preparing a claim

1. Save the draft and evidence. One local draft per sub-order prevents accidental duplicate drafts. Incomplete drafts can be saved after entering the sub-order number.
2. Review the details and files, then check the checkbox authorizing this claim's data and evidence to be sent to the signed-in Meesho account.
3. Choose **Fill claim in Meesho**. The extension opens a new owned Claims tab, follows **Raise Claim**, selects the exact saved issue, and opens **Raise a Ticket**. Supported issues are wrong return, damaged return, missing items and used return.
4. The extension fills fields by observed labels, selects Intact/Tampered, and streams each original file in bounded 512 KiB chunks. SHA-256, type, byte count, issue, supplier account, order, AWB, Packet ID and form identity are verified before evidence dispatch. No arbitrary paths, selectors, code or submit commands are accepted from the listing page.
5. Review upload completion, Meesho validation and eligibility in the prepared tab. Select **Submit** there yourself. The extension never submits a ticket and never treats file delivery as claim acceptance. Record the actual submitted ticket ID in the app to track it locally.

The Claims link supplied in this task redirected **Raise Claim** to `/panel/v3/new/experience/jifdb/support/1`. The wrong-return form was inspected on November 19, 2026 at `/support/1/1/create`. It showed the required fields and file types used by the adapter: `video/mp4`, PNG and JPEG. Dynamic input IDs are not hardcoded; label associations and evidence ID prefixes are used. A panel change produces an actionable stop instead of guessing another field or issue.

## Recovery and integrity

Drafts and blobs save in one IndexedDB transaction. Revisions stop stale writes from another tab. Missing files, storage errors, duplicate sub-orders and unavailable browser storage are shown without claiming a successful save. Submitted status is recorded only from an actual ticket reference entered by the user.

The extension binds each operation to its source tab, app origin, supplier account, draft ID and revision. Evidence bytes are accumulated only in the owned Meesho tab's isolated-world memory and released after dispatch or an abort. Persistent extension records retain bounded operation metadata, not evidence bytes. A reload, wrong-account navigation, manual order edit, changed condition, file replacement, corrupt chunk, duplicate delivery or missing form stops the operation. Use **Open prepared form** to review an interrupted operation; no automatic replay or final submission occurs.

## Validation

`npm run test:claims` covers complete navigation/fill/file delivery, exact source bytes, stored object key reordering, corrupt/incomplete/replayed chunks, wrong accounts, manual edits, source-tab binding, bridge restrictions and the absence of a submit operation. `npm run test:meesho` protects the existing image uploader. TypeScript and targeted ESLint validate the new frontend. Local browser testing uses a synthetic playable MP4 and photos; no real claim is submitted.

Label-reading tests cover shipping-label formats, wrapped and grouped numbers, courier tracking aliases, ambiguous results, low confidence, existing/manual field values, and the supplied Red Tape product barcode. The real OCR engine was also checked against a synthetic shipping-label PNG and the supplied product-label PNG.
