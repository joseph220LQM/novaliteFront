// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwind()],
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 4173,
    strictPort: true,
    // 👇 Permite cualquier Host (útil detrás del proxy de Railway)
    allowedHosts: true,
  },
});
