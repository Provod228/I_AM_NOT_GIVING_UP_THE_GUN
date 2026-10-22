import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
    plugins: [react()],
    build: {
        lib: {
            entry: resolve(__dirname, 'src/mount.tsx'),
            name: 'ReactCheckout',
            formats: ['es'],
            fileName: () => 'react-checkout.js',
        },
        rollupOptions: {
            // React не бандлим — подключается оболочкой через importmap
            external: ['react', 'react-dom', 'react-dom/client'],
        },
        outDir: '../angular-shell/public/react-checkout',
        emptyOutDir: true,
    },
});