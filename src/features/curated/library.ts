// Curated-Library data layer — loads the manifest and per-entry payloads
// from the static bundle.
//
// ADR-0010 specifies:
//   • Discovery via `public/curated/index.json` (small, network-first
//     cacheable by the Service Worker).
//   • Per-entry JSON files live alongside as `public/curated/<slug>.json`
//     and are fetched on demand when the user opens the detail view
//     (cache-first by SW after first hit — natural offline behaviour).
//
// We deliberately compose URLs from `import.meta.env.BASE_URL` so the
// fetcher works under the GitHub-Pages subpath base (ADR-0008 / ADR-0006).
// `BASE_URL` always ends with a `/`, so we concatenate directly without an
// extra separator.
//
// Errors are explicit failure variants — no thrown rejection bleeds into
// the React tree.

import { type CuratedManifest, CuratedManifestSchema } from "@/domain/curated/manifest";
import {
  type ImportError,
  type SharedDeck,
  type SharedDeckSet,
  parseSharedDeck,
  parseSharedDeckSet,
} from "@/domain/shared-deck";

export type LibraryError =
  | { kind: "FetchError"; message: string }
  | { kind: "JsonSyntaxError"; message: string }
  | { kind: "SchemaError"; message: string };

export type LibraryResult<T> = { ok: true; value: T } | { ok: false; error: LibraryError };

/**
 * Resolve a curated bundle path against the app's base URL.
 *
 * Vite's `base: "./"` (ADR-0008, required for the GitHub-Pages subpath
 * `/flipcards/`) means `import.meta.env.BASE_URL` is the relative string
 * `"./"` in production builds. We deliberately keep that relative — `fetch`
 * resolves relative URLs against `document.baseURI`, so on the live site at
 * `https://<user>.github.io/flipcards/` the request goes to
 * `/flipcards/curated/<file>` as intended.
 *
 * Critically, we do NOT normalise `./` to `/`: that would produce an
 * absolute-from-root URL and silently hit the domain root in production,
 * breaking the Curated library under the subpath. In test / dev environments
 * `BASE_URL` is already `/` so the same code path works there.
 *
 * Returns a relative URL string (no leading `/`) for the prod build, or an
 * absolute path for dev/test where `BASE_URL` is `/`.
 */
export function curatedUrl(filename: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  // Ensure exactly one slash between base and the `curated/` segment.
  const sep = base.endsWith("/") ? "" : "/";
  return `${base}${sep}curated/${filename}`;
}

/**
 * Fetch + parse the curated manifest. Returns an empty entry list if the
 * file is unreachable so the caller can still render an empty-library state
 * rather than crashing — the manifest is a build-time concern and may be
 * absent in development or behind a 404 on a misconfigured deployment.
 */
export async function loadCuratedManifest(): Promise<LibraryResult<CuratedManifest>> {
  let response: Response;
  try {
    response = await fetch(curatedUrl("index.json"), { cache: "no-cache" });
  } catch (e) {
    return {
      ok: false,
      error: { kind: "FetchError", message: e instanceof Error ? e.message : String(e) },
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: { kind: "FetchError", message: `HTTP ${response.status} ${response.statusText}` },
    };
  }
  let text: string;
  try {
    text = await response.text();
  } catch (e) {
    return {
      ok: false,
      error: { kind: "FetchError", message: e instanceof Error ? e.message : String(e) },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      error: { kind: "JsonSyntaxError", message: e instanceof Error ? e.message : String(e) },
    };
  }
  const validation = CuratedManifestSchema.safeParse(parsed);
  if (!validation.success) {
    return {
      ok: false,
      error: {
        kind: "SchemaError",
        message: validation.error.issues.map((i) => i.message).join("; "),
      },
    };
  }
  return { ok: true, value: validation.data };
}

export type LoadedDeckPayload =
  | { kind: "deck"; payload: SharedDeck }
  | { kind: "deck-set"; payload: SharedDeckSet };

export type PayloadError = LibraryError | { kind: "ImportError"; importError: ImportError };

/**
 * Fetch + parse a per-entry curated payload. The on-disk file is just a
 * regular `SharedDeck` / `SharedDeckSet` JSON, so we route through the
 * existing parsers — same validation, same migration path, same error
 * vocabulary as a user-uploaded import.
 */
export async function loadCuratedPayload(
  slug: string,
  kind: "deck" | "deck-set",
): Promise<{ ok: true; value: LoadedDeckPayload } | { ok: false; error: PayloadError }> {
  let response: Response;
  try {
    response = await fetch(curatedUrl(`${slug}.json`), { cache: "no-cache" });
  } catch (e) {
    return {
      ok: false,
      error: { kind: "FetchError", message: e instanceof Error ? e.message : String(e) },
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: { kind: "FetchError", message: `HTTP ${response.status} ${response.statusText}` },
    };
  }
  let text: string;
  try {
    text = await response.text();
  } catch (e) {
    return {
      ok: false,
      error: { kind: "FetchError", message: e instanceof Error ? e.message : String(e) },
    };
  }
  if (kind === "deck") {
    const parsed = parseSharedDeck(text);
    if (!parsed.ok) return { ok: false, error: { kind: "ImportError", importError: parsed.error } };
    return { ok: true, value: { kind: "deck", payload: parsed.value } };
  }
  const parsed = parseSharedDeckSet(text);
  if (!parsed.ok) return { ok: false, error: { kind: "ImportError", importError: parsed.error } };
  return { ok: true, value: { kind: "deck-set", payload: parsed.value } };
}
