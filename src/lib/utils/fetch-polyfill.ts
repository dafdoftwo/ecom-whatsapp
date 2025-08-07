/**
 * Fetch polyfill for Node.js environment
 * Required by whatsapp-web.js to work properly
 */

// Polyfill fetch for Node.js environment (required by whatsapp-web.js)
const setupFetchPolyfill = async () => {
  if (typeof global !== 'undefined' && !global.fetch) {
    try {
      // Try to use native fetch first (Node.js 18+)
      if (typeof fetch !== 'undefined') {
        (global as any).fetch = fetch;
        console.log('✅ Using native fetch');
        return;
      }
      
      // Use commonjs require for node-fetch v2
      const nodeFetch = require('node-fetch');
      
      // Create a wrapper that handles common issues
      const fetchWrapper = async (url: any, options: any = {}) => {
        try {
          // Add timeout to prevent hanging
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);
          
          const response = await nodeFetch(url, {
            ...options,
            signal: controller.signal,
            // Disable SSL verification for development
            agent: new (require('https').Agent)({
              rejectUnauthorized: false
            })
          });
          
          clearTimeout(timeout);
          return response;
        } catch (error: any) {
          if (error.name === 'AbortError') {
            throw new Error('Request timeout');
          }
          throw error;
        }
      };
      
      // Adding fetch to global scope
      (global as any).fetch = fetchWrapper;
      (global as any).Headers = nodeFetch.Headers;
      (global as any).Request = nodeFetch.Request;
      (global as any).Response = nodeFetch.Response;
      
      console.log('✅ Fetch polyfill loaded successfully (v2 with wrapper)');
    } catch (error) {
      console.warn('❌ Could not load fetch polyfill:', error);
      
      // Fallback: create a minimal fetch implementation
      (global as any).fetch = async () => {
        throw new Error('Fetch is not available');
      };
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