/**
 * Test script to verify WebSocket server is accessible
 * Run this to test if the WebSocket endpoint is reachable from the internet
 */

import WebSocket from 'ws';

const WS_URL = process.env.WS_TEST_URL || 'wss://api.tavarios.com/api/calls/test-connection/audio';

console.log('🔵 Testing WebSocket server connectivity...');
console.log('🔵 WebSocket URL:', WS_URL);
console.log('');

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ WebSocket connection opened successfully!');
  console.log('✅ Server is accessible from the internet');
  console.log('');
  console.log('Sending test message...');
  ws.send(JSON.stringify({ type: 'test', message: 'Hello from test client' }));
  
  // Close after 2 seconds
  setTimeout(() => {
    console.log('Closing test connection...');
    ws.close();
    process.exit(0);
  }, 2000);
});

ws.on('message', (data) => {
  console.log('📥 Received message from server:', data.toString());
});

ws.on('error', (error) => {
  console.error('❌ WebSocket connection error:');
  console.error('   Error message:', error.message);
  console.error('   Error code:', error.code);
  console.error('');
  console.error('❌ This means the WebSocket server is NOT accessible from the internet');
  console.error('   Possible causes:');
  console.error('   1. Railway does not support WebSocket connections');
  console.error('   2. Firewall/network blocking WebSocket connections');
  console.error('   3. WebSocket server is not listening on the correct path');
  console.error('   4. SSL/TLS certificate issue (for wss://)');
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log('🔌 WebSocket connection closed');
  console.log('   Close code:', code);
  console.log('   Reason:', reason?.toString() || 'No reason');
  process.exit(code === 1000 ? 0 : 1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('❌ Connection timeout - WebSocket server did not respond');
  ws.close();
  process.exit(1);
}, 10000);

