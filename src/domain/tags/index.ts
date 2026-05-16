// Tag-aggregate helpers. The actual sort-by-frequency logic lives in
// `src/domain/card/extractTagsFromCards` since it walks the cards directly;
// this module exists as the canonical import path for the editor's autocomplete
// source (per issue #5 brief) and as the place where future tag-only helpers
// (rename, delete, merge — out of scope here) will land.

export { extractTagsFromCards } from "@/domain/card";
