# API reference

All endpoints use the `/api` prefix and return JSON, except successful logout
which has no body. Reads use query parameters; writes use JSON or form bodies.
Path identifiers take precedence over body values. The authenticated user is
always loaded from the signed session cookie, never from request parameters.

## Authentication and CSRF

`GET /api/session` reports the current session and returns a `csrfToken`. Keep
its signed `csrfToken` cookie and send the token as `X-CSRF-Token` on every POST,
PUT, PATCH, and DELETE request. The browser client does this automatically.
Session cookies are signed, HttpOnly, and SameSite=Lax, and use Secure in `prod`.
Session responses are not cacheable.

| Method | Resource | Purpose | Access |
| --- | --- | --- | --- |
| GET | `/session` | Current session, public user fields, and CSRF token | Public |
| POST | `/session` | Sign in with `email` and `password` | Public + CSRF |
| PATCH | `/session` | Renew the session and replace its cookie | Signed in |
| DELETE | `/session` | Delete the session and clear its cookie | Public + CSRF |
| POST | `/users` | Register an account, including `recaptcha` | Public + CSRF |

Creating a user or session returns `201 Created` with a `Location` header.
Logout returns `204 No Content`. GET requests do not log users out.

## Listings and reviews

| Method | Resource | Purpose | Access |
| --- | --- | --- | --- |
| GET | `/dishes` | Search/filter dishes | Public |
| GET | `/dishes/shelves` | Curated discovery shelves | Public |
| GET | `/dishes/metadata/options` | Category, dish type, and tag choices | Public |
| GET | `/dishes/:dishId` | Dish details | Public |
| GET | `/dishes/:dishId/photos` | Approved review photos | Public |
| GET | `/dishes/:dishId/reviews` | Approved reviews for a dish | Public |
| GET | `/dishes/:dishId/ratings` | Rating history and averages | Public |
| PATCH | `/dishes/:dishId` | Edit details or moderation state | Admin |
| GET | `/restaurants` | Search/filter restaurants | Public |
| GET | `/restaurants/:restaurantId` | Restaurant details | Public |
| GET | `/restaurants/:restaurantId/stats` | Restaurant statistics | Public |
| PATCH | `/restaurants/:restaurantId` | Edit details or moderation state | Admin |
| GET | `/reviews` | Filter reviews | Public |
| GET | `/reviews/feed/:tab` | Recent or following feed | Following requires sign-in |
| GET | `/reviews/:reviewId` | One review | Public |
| POST | `/reviews` | Submit a review and optional new dish/restaurant | Signed in |
| PATCH | `/reviews/:reviewId` | Edit details or moderation state | Admin |
| PUT | `/reviews/:reviewId/vote` | Set the current user's vote to `1` or `-1` | Signed in |
| DELETE | `/reviews/:reviewId/vote` | Remove the current user's vote | Signed in |

Listings use `page` (starting at 1) and `pageSize` (capped at 100). Search and
location filters are handled by each collection. Admins may filter by `status`
(`pending`, `needs_review`, `approved`, `rejected`, or `out_of_area`). Public
listing reads return approved records. Signed-in submission pickers may request
`forSubmission=1` to reuse pending dishes and restaurants.

A review requires `rating` between 1 and 10 and an existing `dishId`, or
`newDish=true` with `newDishData` and a restaurant selection. A new restaurant
uses `newRestaurant=true` and `newRestaurantData`. `photos` contains uploaded
file IDs owned by the submitting user. The form client may send it as a JSON
array string. Successful creation returns `201` and the review's `Location`.

## Profiles and personal collections

| Method | Resource | Purpose | Access |
| --- | --- | --- | --- |
| GET | `/users?q=...` | Search public profiles | Public |
| GET | `/users?view=admin` | Paginated account administration | Admin |
| GET | `/users/:username` | Public profile and recent reviews | Public |
| PATCH | `/users/me` | Update username, bio, or owned avatar | Signed in |
| GET | `/users/:username/favorites` | Paginated favorites | Public |
| GET | `/users/:username/reviews` | Paginated approved reviews | Public |
| GET | `/users/:username/diary?year=2026&month=10` | Diary entries | Public |
| GET | `/users/:username/watchlist` | Paginated watchlist | Public |
| GET | `/users/:username/followers` | Followers | Public |
| GET | `/users/:username/following` | Followed profiles | Public |
| GET | `/users/me/favorites` | Current user's favorites | Signed in |
| GET | `/users/me/favorites/ids` | Favorite dish IDs | Signed in |
| PUT | `/users/me/favorites` | Replace favorites with body `dishIds` | Signed in |
| PUT, DELETE | `/users/me/favorites/:dishId` | Add/remove one favorite | Signed in |
| GET | `/users/me/watchlist/ids` | Watchlist dish IDs | Signed in |
| PUT, DELETE | `/users/me/watchlist/:dishId` | Add/remove one watchlist entry | Signed in |
| PUT, DELETE | `/users/me/following/:userId` | Follow/unfollow a user | Signed in |
| GET | `/users/me/tried/:dishId` | Whether the user tried a dish | Signed in |
| POST | `/users/me/diary` | Create a quick tasting log | Signed in |

PUT sets a desired state; repeating it does not toggle or duplicate membership.
DELETE removes the membership and can be repeated. Creating a diary entry
returns `201`.

## Photos and moderation

| Method | Resource | Purpose | Access |
| --- | --- | --- | --- |
| POST | `/files` | Multipart image upload with field `file` | Signed in |
| PATCH | `/files/:fileId/framing` | Set body `box` with normalized x/y/width/height | Owner or admin |
| GET | `/review-photos` | Filter review photos | Public; pending records require admin |
| GET | `/review-photos/:reviewPhotoId` | One review photo | Public; pending records require admin |
| PATCH | `/review-photos/:reviewPhotoId` | Set status or rotate by 0/90/180/270 degrees clockwise | Admin |
| POST | `/reviews/:reviewId/moderations` | Evaluate one pending review with AI | Admin |
| POST | `/dishes/:dishId/moderations` | Evaluate one pending dish with AI | Admin |
| POST | `/restaurants/:restaurantId/moderations` | Evaluate one pending restaurant with AI | Admin |
| POST | `/review-photos/:reviewPhotoId/moderations` | Evaluate one pending photo with AI | Admin |
| POST | `/restaurants/discoveries` | Run discovery for body `metro` | Admin |
| POST | `/restaurants/search-index/refreshes` | Refresh search data for body `metros` | Admin |

Uploads return `201` and a file ID. The upload limit is 2.1 MiB; supported image
formats are determined by the decoder, and stored content types come from the
image bytes. Moderation/discovery requests run synchronously and return `200`
with their results.

## Responses and errors

A single-resource response usually has `{ success: true, data: ... }`.
Listings have `data` and `total`; profile collections include their pagination
inside `data`. Session and membership responses expose the fields their client
needs. Errors use `{ success: false, message: ... }` and optionally a `code`.

- `400`: invalid input.
- `401`: login required (`AUTH_REQUIRED`) or invalid credentials.
- `403`: forbidden operation or invalid CSRF token (`CSRF_INVALID`).
- `404`: unknown route or unavailable resource.
- `413`: upload/request too large.
- `500`: unexpected server error; internal details are not returned.

The browser retries a request once after refreshing an expired CSRF token.
It does not retry other write failures automatically.
