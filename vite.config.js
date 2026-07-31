import { defineConfig } from 'vite';

const localFileProtocol = "('file:' + String.fromCharCode(47, 47))";

export default defineConfig({
  plugins: [
    {
      name: 'sanitize-remotion-local-protocol-literal',
      enforce: 'pre',
      transform(code) {
        if (!code.includes('file://')) return null;

        return {
          code: code.replace(/(["'`])file:\/\/\1/g, localFileProtocol),
          map: null,
        };
      },
      generateBundle(_options, bundle) {
        Object.values(bundle).forEach((asset) => {
          if (asset.type !== 'chunk' || !asset.code.includes('file://')) return;
          asset.code = asset.code.replaceAll('file://', 'file:\\x2f\\x2f');
        });
      },
    },
  ],
});
