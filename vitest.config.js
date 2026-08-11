import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/ui/setup.js'],
    include: ['tests/ui/**/*.test.jsx'],
    clearMocks: true,
    restoreMocks: true
  }
});
