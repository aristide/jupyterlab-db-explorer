# Fonts

Data4Now uses two typefaces, both available on Google Fonts:

- **Montserrat** (display / headings) — observed in PPTX as "Montserrat SemiBold"
- **Roboto** (body) — observed in PPTX as "Roboto Thin" / "Roboto"
- **JetBrains Mono** (code/mono) — chosen by us; PPTX did not specify a mono face

These are loaded via `@import` in `colors_and_type.css` from Google Fonts. No local TTFs are needed.

## ⚠️ Substitution flag

If Data4Now has **brand-licensed font files** (paid web fonts, foundry contracts, etc.), please drop them in this folder and update `colors_and_type.css` to use `@font-face` instead of the Google Fonts import. The currently loaded versions are the public Google Fonts releases of Montserrat & Roboto, which match the names referenced in the source PPTX but may differ slightly in weight nuance from a paid release.
