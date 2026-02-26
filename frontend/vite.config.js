import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // VITE_API_BASE can be:
  //   http://<EC2-PUBLIC-IP>:8000   ← EC2 demo server
  //   http://localhost:8000          ← local dev
  //   (empty)                        ← same-origin (deployed together)
  const apiBase = env.VITE_API_BASE || 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiBase,
          changeOrigin: true,
          secure: false,
        },
        '/infer': {
          target: apiBase,
          changeOrigin: true,
          secure: false,
        },
        '/v1': {
          target: apiBase,
          changeOrigin: true,
          secure: false,
        },
        '/health': {
          target: apiBase,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    define: {
      __API_BASE__: JSON.stringify(apiBase),
    },
  }
})

