// Test production health endpoint to see what version is running
import https from 'https';

const PRODUCTION_URL = 'https://api.tavarios.com';

console.log('🔍 Testing Production Server...\n');
console.log(`URL: ${PRODUCTION_URL}/health\n`);

const options = {
  hostname: 'api.tavarios.com',
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
      
      if (json.version === 'V2') {
        console.log('✅ CORRECT: Deployment version V2');
      } else if (json.message && json.message.includes('V2')) {
        console.log('✅ CORRECT: Deployment version V2');
      } else {
        console.log('❌ WRONG: Expected health.version === "V2"');
        console.log('   Got:', json.version);
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

