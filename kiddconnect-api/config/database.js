import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Lazy initialization - don't crash on import
let supabase = null;

function initSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables');
  }
  
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  
  return supabase;
}

// Create client immediately if env vars are available (for faster startup)
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch (error) {
    console.error('❌ Failed to create Supabase client:', error.message);
  }
} else {
  console.warn('⚠️ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set - database operations will fail');
}

// Note: Models should use supabaseClient directly for all database operations
// This query function is kept for backward compatibility but may not work for all cases
export const query = async (text, params = []) => {
  console.warn('⚠️ Using raw SQL query - consider using Supabase client methods instead');
  // For complex queries, use Supabase SQL Editor or create RPC functions
  throw new Error('Raw SQL queries not supported. Use Supabase client methods or create RPC functions.');
};

// Create a proxy that initializes the client lazily when accessed
const clientProxy = new Proxy({}, {
  get(target, prop) {
    const client = initSupabase();
    const value = client[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});

// Export the proxy as supabaseClient
export const supabaseClient = clientProxy;

// Helper for table operations
export const from = (table) => {
  const client = initSupabase();
  return client.from(table);
};

// Helper to get a client (for compatibility with existing code)
export const getClient = async () => {
  return initSupabase();
};

export default clientProxy;
