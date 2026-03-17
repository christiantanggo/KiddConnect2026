// Fix assistant webhook URL to use production URL instead of localhost
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { supabaseClient } from '../config/database.js';

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";

if (!VAPI_API_KEY) {
  console.error('❌ VAPI_API_KEY not set in .env file');
  process.exit(1);
}

const vapiClient = axios.create({
  baseURL: VAPI_BASE_URL,
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

async function fixWebhook() {
  try {
    console.log('🔧 Fixing Assistant Webhook URL...\n');

    // Get business with assistant
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('id, name, vapi_assistant_id')
      .not('vapi_assistant_id', 'is', null)
      .limit(1);

    if (error) throw error;

    if (businesses.length === 0) {
      console.log('❌ No businesses with assistants found');
      return;
    }

    const business = businesses[0];
    console.log(`📋 Business: ${business.name}`);
    console.log(`   Assistant ID: ${business.vapi_assistant_id}\n`);

    // Get current assistant
    const assistantRes = await vapiClient.get(`/assistant/${business.vapi_assistant_id}`);
    const assistant = assistantRes.data;

    console.log('🔍 Current Webhook Configuration:');
    console.log(`   URL: ${assistant.serverUrl || 'NOT SET'}`);
    console.log(`   Secret: ${assistant.serverUrlSecret ? 'SET' : 'NOT SET'}\n`);

    // Determine correct webhook URL
    const backendUrl = process.env.BACKEND_URL || 
                       process.env.RAILWAY_PUBLIC_DOMAIN || 
                       process.env.VERCEL_URL ||
                       'https://api.kiddconnect.com';
    
    const webhookUrl = `${backendUrl}/api/vapi/webhook`;
    const webhookSecret = process.env.VAPI_WEBHOOK_SECRET || null;

    console.log('🔧 Updating to:');
    console.log(`   URL: ${webhookUrl}`);
    console.log(`   Secret: ${webhookSecret ? 'SET' : 'NOT SET (check VAPI_WEBHOOK_SECRET)'}\n`);

    // Update assistant
    const updatePayload = {
      serverUrl: webhookUrl,
    };

    if (webhookSecret) {
      updatePayload.serverUrlSecret = webhookSecret;
    }

    console.log('📤 Updating assistant...');
    const updateRes = await vapiClient.patch(`/assistant/${business.vapi_assistant_id}`, updatePayload);
    
    console.log('✅ Assistant updated successfully!\n');
    console.log('📋 Updated Configuration:');
    console.log(`   URL: ${updateRes.data.serverUrl || webhookUrl}`);
    console.log(`   Secret: ${updateRes.data.serverUrlSecret ? 'SET' : 'NOT SET'}\n`);

    console.log('✅ Webhook fix complete!');
    console.log('\n💡 Test a call now - it should work!');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.status === 404) {
      console.error('\n⚠️  Assistant not found in VAPI.');
    } else if (error.response?.status === 401) {
      console.error('\n⚠️  Authentication failed. Check your VAPI_API_KEY.');
    }
  }
}

fixWebhook();



















