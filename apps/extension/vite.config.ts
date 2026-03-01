import { defineConfig, type PluginOption, build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, writeFileSync } from 'fs';

/**
 * Chrome MV3 extension build with Vite.
 *
 * Strategy: We run three separate Vite builds via a custom plugin:
 *   1. Content script  -> dist/content.js (IIFE, self-contained, bundles React)
 *   2. Background SW   -> dist/background.js (IIFE, no React)
 *   3. Options page    -> dist/options/index.html (normal SPA)
 *
 * The main Vite config handles the options page build. A plugin triggers
 * the content + background builds and copies static assets.
 */

const ROOT = __dirname;
const DIST = resolve(ROOT, 'dist');

/** Shim injected at the top of every bundle so `process` is always defined. */
const PROCESS_SHIM = `if(typeof globalThis.process==="undefined"){globalThis.process={env:{}};}`;


function copyStaticAssets(): PluginOption {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      // Copy manifest.json
      copyFileSync(resolve(ROOT, 'src/manifest.json'), resolve(DIST, 'manifest.json'));

      // Create icons directory and write placeholder PNGs
      const iconsDir = resolve(DIST, 'icons');
      if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });

      const publicIconsDir = resolve(ROOT, 'public/icons');
      for (const size of [16, 48, 128]) {
        const pngSrc = resolve(publicIconsDir, `icon${size}.png`);
        const pngDst = resolve(iconsDir, `icon${size}.png`);
        if (existsSync(pngSrc)) {
          copyFileSync(pngSrc, pngDst);
        } else {
          // Write a valid minimal 1x1 PNG so Chrome doesn't error on load
          const minimalPng = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNl7BcQAAAABJRU5ErkJggg==',
            'base64',
          );
          writeFileSync(pngDst, minimalPng);
        }
      }
    },
  };
}

/**
 * Plugin that runs additional Vite builds for the content script and
 * background service worker after the main (options page) build completes.
 */
function buildExtensionScripts(mode: string): PluginOption {
  return {
    name: 'build-extension-scripts',
    async closeBundle() {
      const isDev = mode === 'development';

      // Build content script as IIFE (single self-contained bundle)
      await build({
        configFile: false,
        define: {
          'process.env.NODE_ENV': JSON.stringify(mode),
          'process.env': '{}',
        },
        plugins: [react()],
        build: {
          outDir: DIST,
          emptyOutDir: false,
          minify: !isDev,
          sourcemap: isDev ? 'inline' : false,
          lib: {
            entry: resolve(ROOT, 'src/content/index.tsx'),
            name: 'WalletWhisperContent',
            formats: ['iife'],
            fileName: () => 'content.js',
          },
          rollupOptions: {
            output: {
              intro: PROCESS_SHIM,
              // Ensure React etc. are bundled inline
              inlineDynamicImports: true,
              assetFileNames: (assetInfo) => {
                if (assetInfo.name?.endsWith('.css')) return 'content.css';
                return 'assets/[name]-[hash][extname]';
              },
            },
          },
        },
        resolve: {
          alias: {
            '@': resolve(ROOT, 'src'),
          },
        },
      });

      // Build background service worker as IIFE
      await build({
        configFile: false,
        define: {
          'process.env.NODE_ENV': JSON.stringify(mode),
          'process.env': '{}',
        },
        build: {
          outDir: DIST,
          emptyOutDir: false,
          minify: !isDev,
          sourcemap: isDev ? 'inline' : false,
          lib: {
            entry: resolve(ROOT, 'src/background/index.ts'),
            name: 'WalletWhisperBackground',
            formats: ['iife'],
            fileName: () => 'background.js',
          },
          rollupOptions: {
            output: {
              intro: PROCESS_SHIM,
              inlineDynamicImports: true,
            },
          },
        },
        resolve: {
          alias: {
            '@': resolve(ROOT, 'src'),
          },
        },
      });

      // Build page-bridge as IIFE (injected into page context via script.src)
      await build({
        configFile: false,
        build: {
          outDir: DIST,
          emptyOutDir: false,
          minify: !isDev,
          sourcemap: false,
          lib: {
            entry: resolve(ROOT, 'src/content/page-bridge.ts'),
            name: 'WalletWhisperPageBridge',
            formats: ['iife'],
            fileName: () => 'page-bridge.js',
          },
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
            },
          },
        },
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
    'process.env': '{}',
  },
  plugins: [
    react(),
    buildExtensionScripts(mode),
    copyStaticAssets(),
  ],
  base: './',
  root: resolve(ROOT, 'src/options'),
  build: {
    outDir: resolve(DIST, 'options'),
    emptyOutDir: true,
    minify: mode === 'production',
    sourcemap: mode === 'development' ? 'inline' : false,
    rollupOptions: {
      input: resolve(ROOT, 'src/options/index.html'),
      output: {
        intro: PROCESS_SHIM,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(ROOT, 'src'),
    },
  },
}));
