import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { App } from "@/App";
import "@/styles/globals.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root element missing");

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </ErrorBoundary>
  </StrictMode>,
);