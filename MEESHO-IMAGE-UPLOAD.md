# Direct Meesho image upload

Use **Upload to Meesho** beside an image field in the listing tool. PNG/JPG images up to 4 MB are supported. The control also appears beside the selected image in the AI assistants, in batch review, and in saved-product/variant editors. Extension **0.12.0** supports seller selection on **https://listing-tool-three.vercel.app** and in the local listing app.

The custom Chrome extension reuses one extension-owned Meesho Image Bulk Upload tab, supplies the selected image, requests its direct URL, and fills the original image field. The ordinary listing save flow stores that field in your product database; uploading an image does not separately commit the listing or publish a catalog.

## Connect the extension

Install or update to **Browser AI Test 0.12.1** using the ZIP linked under Product images. Keep one copy enabled and grant it site access to the listing site and the Meesho Supplier Panel in Chrome. The listing page checks the connection automatically and shows the result before image selection. When Chrome makes the extension available in an open tab, the page checks again.

## Choose your seller account

Sign in directly in the Meesho Supplier Panel in the Chrome profile that runs the extension. Leave your seller’s **Image Bulk Upload** or **Claims** page open, then choose **Upload to Meesho**. One detected seller is used for the entire selected batch. If multiple seller pages are open, enter the intended seller’s **Image Bulk Upload** URL in the upload settings. Clear the saved URL and select **Use automatic selection** to switch back to detection.

For a saved upload, picking a seller applies only before the file was supplied. If the file may have been sent, retry checks the original seller tab. Updating the extension clears the staged image bytes, so select the image again if Chrome says the staged file expired and the upload never started.

## Upload without downloading a copy — 0.10.0

Selected images now stay in extension session memory and are supplied as a `File` to Meesho's image input. No image file is created in Downloads, no download notification appears, and Downloads/offscreen permissions are removed. The uploaded image appears directly under its upload status.

The existing preparation message and descriptor remain compatible with the deployed 0.9.1 frontend. Updating and reloading the extension activates memory delivery there; deploying the frontend update also blocks older extensions before they can download a staging copy. Use the updated `browser-extension` folder or extract `public/listing-meesho-extension.zip` into the installed extension folder, reload it in `chrome://extensions`, confirm **0.10.0**, and refresh the listing page. Browser automation cannot open protected extension settings; activation requires this manual step.

Only the current selected image is held in memory. Its bytes, type, fingerprint, product and slot are checked before delivery. The buffer is released after a confirmed result. Service-worker restarts retain the buffer; restarting Chrome or reloading/updating the extension clears it. If an image was never supplied, select it again. If it may already have uploaded, check the original saved operation to avoid a duplicate. Existing copies created by older versions are left untouched.

## Main + supporting images in one selection

In **Product images**, use **Choose up to 4 images**. This is one product's image set, with a main photo and up to three supporting photos. It is separate from the existing multiple-product image/title batch feature.

File selection order does not affect recognized names:

| File | Listing field |
| --- | --- |
| `1.png`, `main.png`, `front.png` | Main image / Image 1 |
| `Sup 1.png` | Supporting image 1 / Image 2 |
| `Sup 2.png` | Supporting image 2 / Image 3 |
| `Sup 3.png` | Supporting image 3 / Image 4 |

Other filenames fill remaining empty slots in natural filename order. Preview all four slots, move photos earlier/later with the arrow buttons if needed, and click **Upload 4 images to Meesho**. Empty slots retain their current links. Repeated main/support slot names, duplicate selections, unsupported files, oversized files, or busy destination slots stop the set before any new image is queued.

Extension **0.8.0** handles both product image sets and variant batches in one reusable Meesho tab. Uploads run serially with separate job IDs, fingerprints and field bindings. Each card displays its own result and progress. The set reaches 100% only when all selected links are confirmed and present in their assigned fields. Retry acts on the failed image's existing operation instead of re-uploading successful files.

If a completed hosted image looks wrong, **Re-upload this image** creates a fresh upload for that selected file and slot only. The other image URLs stay unchanged. This is separate from checking an uncertain upload, which never automatically resends a file.

## Variant main images in bulk

Open **Create variants** or **Batch preview** for a general product and use **Choose variant images**. Select up to 50 PNG/JPG images, 4 MB each. Numbered names map to actual variant versions: `2.png` → V2, `10.png` → V10, and `11.png` → V11. The parent is never a target. Supporting-image names such as `Sup 1.png` are rejected here; use the product image-set uploader for those.

Review each file, preview and target variant before uploading. You can change the target in the preview. Missing, duplicate, removed or busy targets stop the batch before any file is queued. Unselected variants retain their current main image. Only each selected variant's Image 1 override changes; Images 2–4 retain their existing values and inheritance.

Uploads run serially through one extension-owned Meesho tab. Between confirmed uploads the tab reloads to clear the previous file selection. An uncertain previous upload must be recovered before that tab can be reused. The tab handle persists across extension service-worker restarts; a closed completed tab is replaced once. Save the regular product batch to commit the new links to MongoDB.

## Saved phone products and charms

On `/products/model/[model]`, open **Bulk variant main images · Design …** under the relevant parent product. Each parent has its own targets, so a file named `2.png` only maps to V2 within that family. Parents and records without a known variant number are excluded.

On `/charms/[designNumber]`, the same uploader appears above the charm table. It shows the actual available charm versions: for example, if the stored rows are V11–V20, use `11.png`–`20.png`. Draft charms use the existing Apply to Draft / Store in Database workflow. Stored charms are saved separately from their source products.

For saved products and stored charms, upload first, review the assignments and links, then click **Save … main images to database**. Each save request contains only `image1`. Supporting images, titles, prices, SKUs and source products are preserved. Successful saves update their existing row previews. If one save fails, its uploaded link remains available for retry; successful rows are not re-uploaded or saved again. Newer main-image edits on the page block a stale save. **Discard unsaved links** abandons the local pending edits without deleting the uploaded Meesho files. This uses extension 0.8.0 without another extension update.

The phone catalog and design 359 charm page were checked in Chrome. The shared upload/save checks include phone/charm version mapping, field preservation, partial save retry and stale-edit rejection. Seventeen upload tests and TypeScript passed. The new shared components pass targeted ESLint; linting the full charm manager still reports its existing AI-provider `setState` effect error.

## Setup

1. Open **https://listing-tool-three.vercel.app** in Chrome after redeploying the updated frontend. Local development at **http://localhost:3000** or **http://127.0.0.1:3000** also works. Use `npm run dev`, or `npm run dev:webpack` if Turbopack’s CSS worker fails on this computer.
2. Update and reload **Browser AI Test — Local Listing Assistant** in `chrome://extensions`. Confirm **0.12.1** and grant access to the deployed listing domain and Meesho Supplier Panel.
3. For a fresh installation, use **Load unpacked** with this repository’s `browser-extension` folder. A distributable ZIP is served at **/listing-meesho-extension.zip**. Keep one extension copy enabled.
4. Open the listing page and check for the connected status under **Product images**. Sign in to Meesho in Chrome and open your seller’s **Image Bulk Upload** page to use automatic selection, or save its URL in the settings beside an upload button.

The standalone test server on port 4317 is **not required** for listing uploads. With extension 0.10.0 the frontend sends the selected bytes to its fixed extension workflow. The extension validates the file signature, size, SHA-256, product row and image slot, holds the bytes in `chrome.storage.session`, and supplies them through Meesho's ordinary file input and input/change events. Image bytes are never written to persistent extension storage or downloaded. Operation metadata is capped at 250 entries; completed metadata expires when needed. The web app never supplies arbitrary local paths or browser commands.

### Historical 0.9.1 downloaded-copy behavior (replaced by 0.10.0)

1. Redeploy the frontend changes, including the new `browser-extension/listing-browser-stage.js`, `listing-stage.html`, `listing-stage.js`, updated manifest and `public/listing-meesho-extension.zip`.
2. Reload or load unpacked the updated `browser-extension` folder in Chrome. Confirm **0.9.1**, approve Downloads and access to **listing-tool-three.vercel.app**, then refresh the listing page. Chrome's extension settings require a manual user action.
3. Upload from the listing app. No local server, API key or paid AI request is needed for the image upload itself. The old live frontend continues to use server staging until it is redeployed, even after updating the extension.

Validation for 0.9.1: 72 extension tests and 18 listing-upload tests pass, including a 4 MB Blob round-trip, exact deployed-origin checks, forbidden origin/path rejection, resumed preparation, permission detection and no cloud filesystem request. TypeScript and targeted frontend lint pass. Chrome's stored object keys may be reordered; bindings compare row IDs and image fields individually, and the storage fixture reproduces this behavior.

The real Chrome preparation flow was verified with extension **0.9.1** and a user-selected `1.png`: the download copy exactly matched the provided source SHA-256 and 1,265,579-byte length, Meesho returned the operation's direct image URL, Image 1 reached **100%**, and Images 2–4 stayed empty. The existing operation resumed after correcting the key-order comparison; its original prepared copy was retained. No AI or product-database save was used. This real test ran against the updated local frontend using the same browser-preparation protocol as the deployed-site flow. Vercel still needs the frontend changes redeployed before its upload uses that protocol.

Version 0.8.0 was deliberately local-only: its content script could not connect to a deployed site, and a cloud server's staged path could not be read by Chrome on the user's computer. Merely adding the Vercel hostname would not fix file delivery. Version 0.9.1 prepares the file on the browser's computer instead, so the deployed website does not need a local server or a writable Vercel directory. The legacy server staging endpoint remains available only on localhost for 0.8.0 compatibility. A different production or preview domain needs its own explicit extension allowlist entry.

## Matching and progress

- Each operation binds a unique job ID, product/variant row ID, image slot, file fingerprint, and unique remote filename.
- Only the exact corresponding row from Meesho’s **Uploaded image links** table is accepted. A link from another operation, slot, product or filename is rejected.
- Multiple selected slots queue serially. Parent/variant image inheritance remains part of the existing listing behavior; unrelated rows are never filled by the upload control.
- The bar represents confirmed **upload-and-link workflow stages**, rather than invented network-byte percentages. It advances while staging, opening Meesho, supplying the image, verifying the result, and copying/applying the URL. It reaches **100% only after the bound field contains the confirmed URL**.
- Manual field changes during an upload are preserved. Choosing a different source image invalidates automatic application of the old result. An explicit **Use this uploaded image** action remains available for a completed result.
- If an upload may have happened, **Check / retry this saved upload** reads the original Meesho tab and never automatically supplies a second copy. Keep that tab open until completion.
- Result URLs are filled through the field’s normal React update path, so automatic pasting does not depend on clipboard focus. **Copy link** is available as well.

No paid AI call is involved. Existing title generation, SKU rules, Excel exports, and product database APIs are preserved.

## Validation

`npm run test:meesho` checks exact image matching, manual-edit preservation, staged-byte authorization and integrity, serial queues, progress acknowledgement, source-image changes, and HTTP origin boundaries. `npx tsc --noEmit` and targeted ESLint checks validate the integration. Extension regression tests live in the standalone browser test workspace.

The live listing integration passed on November 2, 2026 with custom extension **0.7.0**. A user-selected PNG was uploaded, verified, and filled into its bound Image 1 field at **100%**. Image slots 2–4 stayed unchanged; the uploaded image loaded correctly inside the listing preview. The staged fingerprint matched the selected source file. This check did not save a test listing to the production database or invoke AI.

The live bulk test also passed with `1.png`, `Sup 1.png`, `Sup 2.png`, and `Sup 3.png`. Their four URLs filled Images 1–4 in the intended order, and the set reached **4 of 4 / 100%**. One hosted copy initially had corrupted bytes; the individual re-upload control replaced only that file's link. A final comparison of all four downloaded page assets confirmed exact SHA-256 matches to the user-selected originals. Eleven automated checks, TypeScript, targeted lint, and the existing general-product batch/review checks passed.

The live variant test passed with extension **0.8.0** on November 2, 2026. Files `2.png` through `10.png` filled V2–V10's main images and reached **9 of 9 / 100%** using one Meesho tab. All nine hosted files matched their source SHA-256 and byte length. The original filename, job, row and image1 binding also matched each result. Before/after field comparison confirmed that the parent, V11 and all supporting image links stayed unchanged. The edited product batch was left open without saving to MongoDB or calling AI. Fourteen listing-upload tests, 67 extension tests, TypeScript and targeted ESLint passed.
