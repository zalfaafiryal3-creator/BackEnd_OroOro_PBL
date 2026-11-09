# Cloudinary Integration Plan for Pasar Oro‑Oro Dowo

---

## A. Backend Architecture – Cloudinary

**Chosen provider:** **Cloudinary** (S3‑compatible API is *not* used). We will integrate the **official Cloudinary Node.js SDK** (`cloudinary`) into the existing Express + TypeScript backend.

### 1. High‑level components
| Component | Responsibility |
|---|---|
| `cloudinary` SDK | Communicates with Cloudinary using the **API secret** (kept server‑side). Handles signature generation, URL building, asset verification, and deletion. |
| `StorageService` (new `src/services/cloudinaryService.ts`) | Wrapper around the SDK that provides:
- `generateUploadSignature(params)` – returns the data required for a **Signed Direct Upload**.
- `buildSecureUrl(publicId, options?)` – returns the HTTPS `secure_url` for a given `public_id`.
- `verifyAsset(publicId)` – optional HEAD request via Cloudinary Admin API to confirm the asset exists.
- `deleteAsset(publicId)` – safely removes an old asset.
- `validateUploadParams(folder, resource_type, allowedMime…)` – enforces folder and MIME restrictions. |
| `StorageController` (`src/controllers/cloudinaryController.ts`) | Express routes that expose the above service to the Admin UI (protected by existing auth middleware). |
| `Routes` (`src/routes/cloudinaryRoutes.ts`) | Mounted under `/api/cloudinary`.

All existing middleware (`authMiddleware`, `requireRole('admin')`) will protect the new endpoints, ensuring **only Admin users** can request signatures or perform deletions.

---

## B. Signed Direct Upload Flow

1. **Admin UI** requests a signature → `POST /api/cloudinary/signature` with JSON `{ folder: string, resource_type: string, mime: string, filename: string }`.
2. **Backend** validates:
   - User is authenticated and has role `admin`.
   - `folder` is one of the allowed values (`stores`, `logos`).
   - `mime` belongs to the whitelist (e.g., `image/jpeg`, `image/png`).
   - Optional size limit can be enforced client‑side (Cloudinary does not enforce size on signature generation).
3. **Backend** builds the Cloudinary upload parameters:
   ```ts
   const timestamp = Math.round(Date.now() / 1000);
   const params = { folder, public_id: `${folder}/${uuidv4()}_${filename}`, resource_type, timestamp };
   const signature = cloudinary.utils.api_sign_request(params, CLOUDINARY_API_SECRET);
   ```
4. **Backend** returns to Admin UI:
   ```json
   {
     "cloud_name": "<cloud_name>",
     "api_key": "<api_key>",
     "timestamp": <timestamp>,
     "signature": "<signature>",
     "folder": "<folder>",
     "public_id": "<public_id>",
     "resource_type": "image"
   }
   ```
5. **Admin UI** performs a **direct upload** to Cloudinary (`https://api.cloudinary.com/v1_1/<cloud_name>/image/upload`) using a **multipart/form‑data** request that includes the above fields and the selected file.
6. Cloudinary responds with JSON that contains at least `public_id` and `secure_url`.
7. **Admin UI** sends a follow‑up request to the backend (`POST /api/cloudinary/confirm`) containing:
   ```json
   { "public_id": "stores/12/banner_abc123", "type": "banner", "storeId": 12 }
   ```
8. **Backend** validates the `public_id` (ensuring it matches the previously‑generated folder and pattern) by calling `cloudinary.api.resource(public_id)`.
9. If verification succeeds, the backend **stores the reference** in the appropriate Prisma field (`bannerUrl`, `logoUrl`, or `photoUrl`). The stored value uses a **distinct prefix** so we can differentiate cloud assets from legacy local paths:
   - `cloudinary:stores/12/banner_abc123`
   - `cloudinary:logos/12/logo_xyz789`
   - `cloudinary:products/34/photo_def456`

   The prefix (`cloudinary:`) guarantees no collision with existing relative paths such as `assets/store/12/banner.jpg`.

---

## C. Data Model & Compatibility

- **No Prisma migration** – we continue to use the existing nullable string columns (`bannerUrl`, `logoUrl`, `photoUrl`).
- **Stored format:** `cloudinary:<public_id>` (e.g., `cloudinary:stores/12/banner_abc123`).
- **Legacy format:** any value **without** the `cloudinary:` prefix, typically a relative path (`assets/...`).

When the API builds a DTO for Admin or Mobile, a small **resolver** determines the final URL:
```ts
function resolveImage(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith('cloudinary:')) {
    const publicId = value.replace(/^cloudinary:/, '');
    return cloudinaryService.buildSecureUrl(publicId);
  }
  // Assume legacy local asset – keep unchanged (Mobile already handles http/asset logic)
  return value;
}
```
This logic is applied in `storeController.ts` (within `toStoreDto`) for `bannerUrl` and `logoUrl`, and similarly for `photoUrl` when product DTOs are added later.

---

## D. Service Specification (`cloudinaryService.ts`)

| Method | Description |
|---|---|
| `generateSignature(folder: string, filename: string, mime: string): SignaturePayload` | Returns `{ cloud_name, api_key, timestamp, signature, public_id, folder, resource_type }`. Uses `cloudinary.utils.api_sign_request`. |
| `buildSecureUrl(publicId: string, options?: { width?: number; height?: number; format?: string }): string` | Returns `https://res.cloudinary.com/<cloud_name>/image/upload/<transformations>/<publicId>.<format>` via `cloudinary.url(publicId, options)`. |
| `verifyAsset(publicId: string): Promise<boolean>` | Calls `cloudinary.api.resource(publicId)`; resolves `true` if status is `ok`. |
| `deleteAsset(publicId: string): Promise<void>` | Calls `cloudinary.uploader.destroy(publicId)`; resolves when Cloudinary confirms deletion. |
| `validateParams(folder: string, mime: string): void` | Throws if `folder` not in whitelist (`stores`, `logos`, `products`) or MIME not allowed (`image/jpeg`, `image/png`, `image/webp`). |

All methods catch SDK errors and re‑throw a sanitized `Error` that does **not** expose secrets.

---

## E. Security Considerations

1. **Auth & Role** – Every endpoint (`/signature`, `/confirm`, `/delete`) is guarded by `authMiddleware` + `requireRole('admin')`.
2. **Never expose `API_SECRET`.** The SDK uses it server‑side only; the response to the client never contains the secret.
3. **Input validation** –
   - `folder` must be one of the allowed directories.
   - `resource_type` is fixed to `image` for this project.
   - `mime` is validated against a whitelist.
4. **Public‑ID verification** – Before persisting, the backend calls `cloudinary.api.resource(public_id)` to ensure the asset really exists and belongs to the expected folder.
5. **Deletion safety** – When a store updates its banner/logo, the flow is:
   - Request new signature → upload → confirm → **store new reference** → **then** delete the old asset (if the old reference has the `cloudinary:` prefix). This guarantees there is never a period where the store has no image.
6. **Rate limiting** – The existing `rateLimiter` middleware continues to protect the new routes.
7. **Size limit** – Cloudinary can enforce size via `max_file_size` upload preset; alternatively, the Admin UI can check the file size before uploading (recommended).

---

## F. Endpoints (to be added under `/api/cloudinary`)

| Method | Path | Request Body | Response | Auth
|---|---|---|---|---|
| `POST` | `/signature` | `{ folder: string, filename: string, mime: string }` | `{ cloud_name, api_key, timestamp, signature, public_id, folder, resource_type }` | Admin only |
| `POST` | `/confirm` | `{ public_id: string, type: "banner"|"logo"|"product", storeId?: number, productId?: number }` | `{ success: true, url: string }` (the `secure_url`) | Admin only |
| `DELETE` | `/asset` | `{ public_id: string }` | `{ success: true }` | Admin only |

**Note:** The `type` field tells the controller which Prisma column to update (`bannerUrl`, `logoUrl`, or `photoUrl`). For product images the future product controller can reuse the same endpoint.

---

## G. Integration with Admin UI & Mobile

- **Admin UI** calls `/api/cloudinary/signature` to receive the signed parameters, uploads directly to Cloudinary, then calls `/api/cloudinary/confirm` with the returned `public_id`.
- **Backend** stores `cloudinary:<public_id>` in the appropriate column.
- **DTO conversion** (as described in section C) turns that stored value into the **secure URL** (`https://res.cloudinary.com/<cloud_name>/image/upload/<public_id>`) before sending the response.
- **Mobile** already handles HTTP URLs; the secure URL will be sent as a normal HTTPS string, so no code change is needed on the Flutter side.

---

## H. Compatibility Strategy for Existing Local Images

1. **Legacy values** remain unchanged (`assets/...`). When resolving URLs, the backend checks the prefix; if absent, the value is returned unchanged.
2. **Gradual migration** – Admin can replace an existing image using the new flow. The old local file can be kept on disk or removed manually; the backend never attempts to delete it.
3. **Fallback** – If a store has both a legacy path and a new Cloudinary reference (unlikely), the resolver prefers the Cloudinary URL because it starts with `https://` after conversion.

---

## I. Replacement & Deletion Strategy

1. **Upload new image** → get `public_id` → **confirm** → backend stores new reference.
2. **After successful DB update**, the controller checks the *previous* value:
   - If it started with `cloudinary:`, extract the old `public_id` and call `cloudinaryService.deleteAsset(oldPublicId)`.
   - If it was a legacy path, do nothing (optional manual cleanup later).
3. This *two‑step* approach guarantees that the store never loses its image if the new upload fails.

---

## J. Required Environment Variables (to be added to `.env.example` only)

```dotenv
CLOUDINARY_CLOUD_NAME=your-cloud-name          # public identifier, safe to expose to client via signature response
CLOUDINARY_API_KEY=your-api-key                # used only to build the signature response (never sent to client)
CLOUDINARY_API_SECRET=your-api-secret          # **server‑only**, never written to client files
CLOUDINARY_UPLOAD_PRESET=optional-preset        # optional, can enforce size/type restrictions
# Optional limits
MAX_UPLOAD_SIZE_BYTES=5242880                  # 5 MiB, enforced by Admin UI before upload
```
> **Do not** commit real values; keep placeholders.

---

## K. Test Plan (unit & integration)

| Test | Description |
|---|---|
| **Unit – CloudinaryService** | Mock `cloudinary` SDK; verify that `generateSignature` returns correct fields, `buildSecureUrl` composes the expected URL, `verifyAsset` calls the SDK, `deleteAsset` forwards the correct `public_id`. |
| **Controller – signature endpoint** | Authenticated admin receives a signature; unauthenticated or non‑admin receives `401`. Invalid folder/mime yields `400`. |
| **Controller – confirm endpoint** | Valid `public_id` updates the correct Prisma column and returns the secure URL. Invalid/unknown `public_id` returns `400`. Old Cloudinary reference is deleted after success. |
| **DTO conversion** | Given a store row with `bannerUrl = 'cloudinary:stores/12/banner_abc'`, the API response contains the full HTTPS `secure_url`. Given a legacy path, the response returns the unchanged string. |
| **End‑to‑end (manual)** | Simulate Admin UI: request signature, perform a real upload to a test Cloudinary account (can be mocked), confirm, then GET the store – ensure the returned URL is reachable. |
| **Security** | Ensure `CLOUDINARY_API_SECRET` never appears in any response body or logs. Verify rate‑limit headers are respected on new routes. |

All tests should run under the existing Jest/TS‑Jest configuration for the backend (`npm test`). No database migration is required; tests can use an in‑memory SQLite DB or a test SQLite file.

---

## L. Summary of Minimal Implementation Steps (when approved)
1. Add `cloudinary` SDK to `package.json` (development only – not executed now). 
2. Create `src/services/cloudinaryService.ts` implementing the methods above.
3. Create `src/controllers/cloudinaryController.ts` exposing the three routes.
4. Add `src/routes/cloudinaryRoutes.ts` and mount it in `app.ts` (`app.use('/api/cloudinary', cloudinaryRouter);`).
5. Update `storeController.ts` DTO mapper (`toStoreDto`) to call `cloudinaryService.buildSecureUrl` when the stored value starts with `cloudinary:`.
6. Add environment variable definitions to `.env.example`.
7. Write unit tests for the service and controller.

No code changes, migrations, or credential exposure are performed at this design‑only stage.

---

*Document created as `CloudinaryIntegrationPlan.md` in the project root. Awaiting your approval before any implementation.*

