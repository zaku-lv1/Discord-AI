#!/usr/bin/env node
/**
 * Test script to verify the authentication timing issue fix
 * This test validates that login succeeds and authentication is immediately available
 */

const fetch = require('node-fetch');
const assert = require('assert');

const baseUrl = 'http://localhost:8080';

async function testAuthTimingFix() {
  console.log('🔧 Testing authentication timing fix...\n');

  try {
    // Test multiple rapid login/auth check cycles
    for (let cycle = 1; cycle <= 3; cycle++) {
      console.log(`--- Test Cycle ${cycle}/3 ---`);
      
      // 1. Start fresh session
      let sessionCookies = '';
      const mainPageResponse = await fetch(`${baseUrl}/`);
      const setCookieHeaders = mainPageResponse.headers.get('set-cookie');
      if (setCookieHeaders) {
        sessionCookies = setCookieHeaders.split(',').map(cookie => cookie.split(';')[0]).join('; ');
      }

      // 2. Perform login
      const loginResponse = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': sessionCookies
        },
        body: JSON.stringify({
          username: 'test@example.com',
          password: 'password123',
          rememberMe: false
        })
      });

      const loginData = await loginResponse.json();
      
      // Update cookies from login response
      const loginSetCookieHeaders = loginResponse.headers.get('set-cookie');
      if (loginSetCookieHeaders) {
        const newCookies = loginSetCookieHeaders.split(',').map(cookie => cookie.split(';')[0]);
        const allCookies = sessionCookies.split('; ').concat(newCookies);
        sessionCookies = [...new Set(allCookies.filter(c => c))].join('; ');
      }

      // Verify login succeeded
      assert.strictEqual(loginData.success, true, `Login should succeed in cycle ${cycle}`);
      assert.ok(loginData.user, `User data should be present in cycle ${cycle}`);
      assert.ok(loginData.sessionInfo, `Session info should be present in cycle ${cycle}`);
      
      console.log(`  ✓ Login successful - sessionId: ${loginData.sessionInfo.sessionId}`);

      // 3. Immediately verify authentication (this was the failing case)
      const authCheckResponse = await fetch(`${baseUrl}/auth/user`, {
        headers: { 
          'Cookie': sessionCookies,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      const authCheckData = await authCheckResponse.json();
      
      // This should now succeed immediately without retries
      assert.strictEqual(authCheckResponse.status, 200, `Auth check should return 200 in cycle ${cycle}`);
      assert.strictEqual(authCheckData.authenticated, true, `Auth check should return authenticated=true in cycle ${cycle}`);
      assert.ok(authCheckData.user, `Auth check should return user data in cycle ${cycle}`);
      assert.strictEqual(authCheckData.user.username, 'testuser', `Auth check should return correct username in cycle ${cycle}`);
      
      console.log(`  ✓ Immediate auth check successful - user: ${authCheckData.user.username}`);
      console.log(`  ✓ Cycle ${cycle} completed successfully\n`);
    }

    console.log('🎉 All tests passed! Authentication timing issue is fixed.');
    return true;

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run the test
if (require.main === module) {
  testAuthTimingFix().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });
}

module.exports = { testAuthTimingFix };