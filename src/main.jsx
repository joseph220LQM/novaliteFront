import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App
      mode="both"
      apiBase={import.meta.env.VITE_API_BASE}
      wsPath={import.meta.env.VITE_WS_URL} // absoluto (wss://...)
    />
  </StrictMode>
);

