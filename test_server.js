#!/usr/bin/env node

// Simple test script to verify the refactored server functionality
const http = require('http');

const testEndpoints = [
  { path: '/api/health', method: 'GET', expected: 200 },
  { path: '/', method: 'GET', expected: 200 },
  { path: '/auth/user', method: 'GET', expected: 200 },
  { path: '/nonexistent', method: 'GET', expected: 404 }
];

function testEndpoint(endpoint) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 8080,
      path: endpoint.path,
      method: endpoint.method
    }, (res) => {
      const success = res.statusCode === endpoint.expected;
      console.log(`${success ? '✅' : '❌'} ${endpoint.method} ${endpoint.path} - Expected: ${endpoint.expected}, Got: ${res.statusCode}`);
      resolve(success);
    });

    req.on('error', (err) => {
      console.log(`❌ ${endpoint.method} ${endpoint.path} - Error: ${err.message}`);
      resolve(false);
    });

    req.setTimeout(5000, () => {
      console.log(`❌ ${endpoint.method} ${endpoint.path} - Timeout`);
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing refactored Discord AI server...\n');
  
  const results = [];
  for (const endpoint of testEndpoints) {
    results.push(await testEndpoint(endpoint));
  }
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n📊 Test Results: ${passed}/${total} passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Server refactoring is successful.');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Please check the server.');
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { testEndpoint, runTests };