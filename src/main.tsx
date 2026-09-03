import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { initSync } from "./lib/sync";
import { registerSW } from "./lib/push";

/* boot the machine room before paint-critical work */
void initSync();
void registerSW();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
