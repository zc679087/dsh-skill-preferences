/**
 * Browser bundle for the Skills settings tab.
 *
 * DSH builds its own client packages through `packages/client/tsdown.client.ts`,
 * which is repository-internal. This is the same artifact contract restated for
 * an out-of-tree plugin: a CJS factory handed to `window.__ModuleLoader__.load`,
 * platform modules resolved through the loader's frozen module table, and
 * everything else inlined. CSS Modules are compiled here and injected as a
 * `<style data-plugin>` tag the loader removes on unload.
 */

import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import { transform } from 'lightningcss'
import { defineConfig } from 'tsdown'

const ID = 'dsh-skill-preferences'

/**
 * Specifiers the Web shell shares into its frozen module table. A client bundle
 * MUST import these rather than inline them: a second copy of React or of the
 * slot registry would carry a separate runtime identity.
 */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

// The suffix matters: tsdown's css guard matches ids ending in `.css`, so the
// virtual id must not.
const CSS_PREFIX = '\0dsh-css:'
const CSS_SUFFIX = '.mjs'

export default defineConfig({
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: PLATFORM_MODULES,
  // tsdown auto-externalizes declared dependencies; anything the module table
  // cannot answer must inline instead, so the rule is the table list itself.
  noExternal: (id: string) => (PLATFORM_MODULES.includes(id) ? undefined : true),
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  plugins: [{
    // Build-time mirror of the module-edge rule: a cross-plugin value import
    // either duplicates a runtime instance or asks the frozen table for a
    // specifier it cannot answer. Type-only imports are erased before this.
    name: 'client-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (PLATFORM_MODULES.includes(source)) return null
      throw new Error(
        `client bundle purity: "${source}" is not a platform module — `
        + 'collaborate through cordis services instead of importing another plugin package',
      )
    },
  }, {
    name: 'css-modules-inline',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css')) return null
      const abs = importer === undefined ? source : resolvePath(dirname(importer), source)
      return CSS_PREFIX + abs + CSS_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_PREFIX)) return null
      const fileId = virtualId.slice(CSS_PREFIX.length, -CSS_SUFFIX.length)
      this.addWatchFile(fileId)
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: await readFile(fileId),
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap: Record<string, string> = {}
      for (const [local, exported] of Object.entries(cssExports ?? {})) classMap[local] = exported.name
      const tagId = `${ID}/${basename(fileId)}`
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
        '  const tag = document.createElement(\'style\');',
        `  tag.dataset.plugin = ${JSON.stringify(ID)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
