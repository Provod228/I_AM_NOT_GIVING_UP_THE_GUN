import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
    plugins: [react()],
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
        lib: {
            entry: resolve(__dirname, 'src/mount.tsx'),
            name: 'ReactCheckout',
            formats: ['es'],
            fileName: () => 'react-checkout.js',
        },
        outDir: '../angular-shell/public/react-checkout',
        emptyOutDir: true,
    },
});