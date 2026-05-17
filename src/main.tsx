import { router } from "@/app/router";
import { initTheme } from "@/lib/settings/theme";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";

// Apply the persisted theme before React mounts so the first paint matches
// the user's choice — avoids a brief flash of the OS default.
initTheme();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element missing in index.html");

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
