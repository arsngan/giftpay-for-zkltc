import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// injected() + wagmi + viem run in the browser with no Node polyfills — plain config.
export default defineConfig({
  plugins: [react()],
  // Pre-bundle deps at startup so vite never re-optimizes mid-serve — a mid-serve re-optimize force-
  // reloads and DROPS in-flight sibling-module requests (src/data.ts, src/wagmi.ts…), which white-
  // screens a multi-module build in the pod. optimizeDeps.include covers every package.json dep; the
  // warmup pre-transforms the entry + App so siblings are ready. (See dappit-template-import-shake.)
  optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'wagmi', 'viem', '@tanstack/react-query'] },
  server: { warmup: { clientFiles: ['./src/main.tsx', './src/App.tsx'] } },
});
