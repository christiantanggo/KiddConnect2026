// Test production health endpoint to see what version is running
import https from 'https';

const PRODUCTION_URL = 'https://api.kiddconnect.com';

console.log('🔍 Testing Production Server...\n');
console.log(`URL: ${PRODUCTION_URL}/health\n`);

const options = {
  hostname: 'api.kiddconnect.com',
  path: '/health',
  method: 'GET',
  headers: {
    'User-Agent': 'Tavari-Health-Check'
  }
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`Status: ${res.statusCode}\n`);
    
    try {
      const json = JSON.parse(data);
      console.log('Response:');
      console.log(JSON.stringify(json, null, 2));
      console.log('\n');
      
      if (json.version === 'VAPI_VERSION') {
        console.log('✅ CORRECT: Running VAPI version!');
      } else if (json.message && json.message.includes('VAPI')) {
        console.log('✅ CORRECT: Running VAPI version!');
      } else {
        console.log('❌ WRONG: Not running VAPI version!');
        console.log('   Railway is still running old code.');
      }
    } catch (error) {
      console.log('Raw response:', data);
      console.log('\n⚠️  Could not parse JSON response');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error.message);
  console.log('\n⚠️  Could not reach production server');
  console.log('   This might mean:');
  console.log('   - Server is down');
  console.log('   - URL is incorrect');
  console.log('   - Network issue');
});

req.setTimeout(10000, () => {
  req.destroy();
  console.log('\n❌ Request timeout');
});

req.end();

