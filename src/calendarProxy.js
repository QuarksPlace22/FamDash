import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/calendar": {
        target: "https://calendar.google.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/calendar/, ""),
      },
    },
  },
});
