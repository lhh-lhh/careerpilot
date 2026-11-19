import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    target: "es2022",
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "zrender",
              test: /node_modules[\\/]zrender/,
              priority: 20,
            },
            {
              name: "echarts",
              test: /node_modules[\\/]echarts/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
