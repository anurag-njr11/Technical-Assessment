import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import errorOverlay from "@visulima/vite-overlay"

const config = defineConfig({
  plugins: [
    devtools({ injectSource: { enabled: false } }),
    errorOverlay({
      forwardConsole: true,
      forwardedConsoleMethods: ["error", "warn"],
    }),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    // Required for the production build (server output). Do not add a nitro.config.ts.
    nitro(),
    viteReact(),
  ],
})

export default config
