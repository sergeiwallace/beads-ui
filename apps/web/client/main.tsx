// First, so the Trusted Types default policy exists before any module can reach a DOM sink.
import "./trusted-types.ts";
import "@sergeiwallace/beads-ui-web-ui/theme.css";
import "@sergeiwallace/beads-ui-web-ui/web-ui.css";
import "./app.css";
import { ToastProvider } from "@sergeiwallace/beads-ui-web-ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");
createRoot(root).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
