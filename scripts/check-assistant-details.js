// Check detailed assistant information for a phone number
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

async function checkAssistantDetails() {
  try {
    console.log('🔍 Checking Assistant Details for Phone Number...\n');

    // Get business with phone number
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('id, name, vapi_phone_number, vapi_assistant_id')
      .not('vapi_phone_number', 'is', null)
      .limit(1);

    if (error) throw error;

    if (businesses.length === 0) {
      console.log('❌ No businesses with phone numbers found');
      return;
    }

    const business = businesses[0];
    console.log(`📋 Business: ${business.name}`);
    console.log(`   Phone Number: ${business.vapi_phone_number}`);
    console.log(`   Assistant ID: ${business.vapi_assistant_id || 'NOT SET'}\n`);

    if (!business.vapi_assistant_id) {
      console.log('⚠️  No assistant ID stored in database');
      return;
    }

    // Get assistant details from VAPI
    console.log('📞 Fetching assistant details from VAPI...\n');
    const assistantRes = await vapiClient.get(`/assistant/${business.vapi_assistant_id}`);
    const assistant = assistantRes.data;

    console.log('🤖 Assistant Details:');
    console.log(`   Name: ${assistant.name || 'N/A'}`);
    console.log(`   ID: ${assistant.id}`);
    console.log(`   Status: ${assistant.status || 'unknown'}`);
    console.log(`   Created: ${assistant.createdAt || assistant.created_at || 'N/A'}`);
    console.log(`   Updated: ${assistant.updatedAt || assistant.updated_at || 'N/A'}\n`);

    // Model configuration
    if (assistant.model) {
      console.log('🧠 Model Configuration:');
      console.log(`   Provider: ${assistant.model.provider || 'N/A'}`);
      console.log(`   Model: ${assistant.model.model || 'N/A'}`);
      console.log(`   Temperature: ${assistant.model.temperature || 'N/A'}`);
      if (assistant.model.messages) {
        console.log(`   System Messages: ${assistant.model.messages.length}`);
        assistant.model.messages.forEach((msg, idx) => {
          if (msg.role === 'system') {
            const preview = msg.content.substring(0, 200);
            console.log(`      [${idx}] ${preview}${msg.content.length > 200 ? '...' : ''}`);
          }
        });
      }
      console.log('');
    }

    // Voice configuration
    if (assistant.voice) {
      console.log('🎤 Voice Configuration:');
      console.log(`   Provider: ${assistant.voice.provider || 'N/A'}`);
      console.log(`   Voice ID: ${assistant.voice.voiceId || assistant.voice.voice_id || 'N/A'}`);
      console.log('');
    }

    // First message
    if (assistant.firstMessage) {
      console.log('💬 First Message (Greeting):');
      console.log(`   "${assistant.firstMessage}"\n`);
    }

    // Server URL (webhook)
    if (assistant.serverUrl) {
      console.log('🔗 Webhook Configuration:');
      console.log(`   URL: ${assistant.serverUrl}`);
      console.log(`   Secret: ${assistant.serverUrlSecret ? '***SET***' : 'NOT SET'}\n`);
    }

    // Check which phone number is linked to this assistant
    console.log('📱 Linked Phone Numbers:');
    const phoneNumbersRes = await vapiClient.get('/phone-number');
    const phoneNumbers = Array.isArray(phoneNumbersRes.data) 
      ? phoneNumbersRes.data 
      : (phoneNumbersRes.data?.data || []);
    
    const linkedNumbers = phoneNumbers.filter(
      pn => pn.assistantId === assistant.id || pn.assistant?.id === assistant.id
    );

    if (linkedNumbers.length === 0) {
      console.log('   ⚠️  No phone numbers linked to this assistant!\n');
    } else {
      linkedNumbers.forEach(pn => {
        console.log(`   ✅ ${pn.number || pn.phoneNumber || pn.phone_number || pn.id}`);
        console.log(`      Status: ${pn.status || 'unknown'}`);
        console.log(`      ID: ${pn.id}`);
      });
      console.log('');
    }

    // Check database AI agent
    console.log('💾 Database AI Agent:');
    const { data: aiAgents, error: agentError } = await supabaseClient
      .from('ai_agents')
      .select('*')
      .eq('business_id', business.id)
      .limit(1);

    if (agentError) {
      console.log(`   ⚠️  Error fetching: ${agentError.message}`);
    } else if (aiAgents.length === 0) {
      console.log('   ⚠️  No AI agent found in database');
    } else {
      const agent = aiAgents[0];
      console.log(`   ID: ${agent.id}`);
      console.log(`   Greeting: ${agent.greeting_text || 'N/A'}`);
      console.log(`   System Instructions: ${agent.system_instructions ? agent.system_instructions.substring(0, 100) + '...' : 'N/A'}`);
      console.log(`   FAQs: ${agent.faqs ? agent.faqs.length : 0}`);
      console.log(`   Business Hours: ${agent.business_hours ? 'SET' : 'NOT SET'}`);
    }

    console.log('\n✅ Check complete!');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.status === 404) {
      console.error('\n⚠️  Assistant not found in VAPI. It may have been deleted.');
    } else if (error.response?.status === 401) {
      console.error('\n⚠️  Authentication failed. Check your VAPI_API_KEY.');
    }
  }
}

checkAssistantDetails();



















