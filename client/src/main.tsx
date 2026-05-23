import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";

// Stylesheet load order matters:
//   1. tokens.css — design tokens (custom properties) consumed by everything below
//   2. global.css — body / typography / reset
//   3. atmosphere.css — pinned ambient layer (grid + glow)
//   4. shell.css — cross-cutting shell primitives (section-label, scroll-fade,
//                  vault-footer, .ctrl)
//   5. archive.css — cross-cutting archive primitives (cat-block, tree-row,
//                    archive-label, tree-children rise)
//
// Per MIGRATION_RULES.md Rule 18, per-component layout lives in *.module.css
// siblings of each component file and is imported by that component directly.
import "@/styles/tokens.css";
import "@/styles/global.css";
import "@/styles/atmosphere.css";
import "@/styles/shell.css";
import "@/styles/archive.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
