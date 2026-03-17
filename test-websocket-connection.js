/**
 * Test script to verify WebSocket server is accessible
 * Run: node test-websocket-connection.js
 */

import WebSocket from 'ws';

const testUrl = 'wss://api.kiddconnect.com/api/calls/test-connection/audio';

console.log('🔵 Testing WebSocket connection to:', testUrl);
console.log('🔵 This should connect and receive a test response...\n');

const ws = new WebSocket(testUrl);

ws.on('open', () => {
  console.log('✅ WebSocket connection opened successfully!');
  console.log('✅ Server is accessible from the internet');
});

ws.on('message', (data) => {
  console.log('📥 Received message from server:', data.toString());
  ws.close();
});

ws.on('error', (error) => {
  console.error('❌ WebSocket connection error:', error.message);
  console.error('❌ Error code:', error.code);
  console.error('❌ This means the WebSocket server is NOT accessible');
  console.error('\nPossible causes:');
  console.error('  1. Railway is blocking WebSocket connections');
  console.error('  2. SSL certificate issue');
  console.error('  3. WebSocket server not running');
  console.error('  4. Network/firewall blocking the connection');
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log('\n🔌 WebSocket closed');
  console.log('   Code:', code);
  console.log('   Reason:', reason?.toString() || 'No reason');
  
  if (code === 1000) {
    console.log('✅ Connection closed normally (test successful)');
  } else {
    console.log('⚠️  Connection closed unexpectedly');
  }
  
  process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('\n❌ Connection timeout - server did not respond');
  console.error('❌ This suggests the WebSocket server is not accessible');
  ws.close();
  process.exit(1);
}, 10000);

