/**
 * Global error handler for network errors
 */

// Handle ECONNRESET errors globally
export function setupGlobalErrorHandlers() {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise) => {
    if (reason?.code === 'ECONNRESET') {
      console.log('⚠️ ECONNRESET error caught and handled');
      return; // Suppress ECONNRESET errors
    }
    console.error('Unhandled Rejection:', reason);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    if ((error as any).code === 'ECONNRESET') {
      console.log('⚠️ ECONNRESET exception caught and handled');
      return; // Suppress ECONNRESET errors
    }
    console.error('Uncaught Exception:', error);
    // Don't exit for non-critical errors
    if ((error as any).code !== 'ECONNREFUSED') {
      return;
    }
  });

  // Handle Node warnings
  process.on('warning', (warning) => {
    if (warning.message?.includes('ECONNRESET')) {
      return; // Suppress ECONNRESET warnings
    }
    console.warn('Warning:', warning);
  });
}

// Network error retry wrapper
export async function withNetworkRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a network error
      if (error.code === 'ECONNRESET' || 
          error.code === 'ECONNREFUSED' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ESOCKETTIMEDOUT') {
        
        console.log(`⚠️ Network error (attempt ${i + 1}/${maxRetries}): ${error.code}`);
        
        if (i < maxRetries - 1) {
          // Wait before retry with exponential backoff
          const waitTime = delay * Math.pow(2, i);
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

// Safe fetch wrapper
export async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  return withNetworkRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      return response;
    } catch (error: any) {
      clearTimeout(timeout);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout: ${url}`);
      }
      
      throw error;
    }
  });
} 