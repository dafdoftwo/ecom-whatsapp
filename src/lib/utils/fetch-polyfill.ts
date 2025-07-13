/**
 * Fetch polyfill for Node.js environment
 * Required by whatsapp-web.js to work properly
 */

// Polyfill fetch for Node.js environment (required by whatsapp-web.js)
const setupFetchPolyfill = async () => {
  if (typeof global !== 'undefined' && !global.fetch) {
    try {
      // Use commonjs require for node-fetch v2
      const fetch = require('node-fetch');
      
      // Adding fetch to global scope
      (global as any).fetch = fetch;
      (global as any).Headers = fetch.Headers;
      (global as any).Request = fetch.Request;
      (global as any).Response = fetch.Response;
      
      console.log('✅ Fetch polyfill loaded successfully (v2)');
    } catch (error) {
      console.warn('❌ Could not load fetch polyfill:', error);
    }
  } else {
    console.log('📱 Fetch already available');
  }
};

// Initialize fetch polyfill immediately and wait for it
let fetchPolyfillReady: Promise<void> | null = null;

export const ensureFetchPolyfill = async (): Promise<void> => {
  if (!fetchPolyfillReady) {
    fetchPolyfillReady = setupFetchPolyfill();
  }
  await fetchPolyfillReady;
}; 