#!/usr/bin/env node
/**
 * Final verification test that exactly matches the original problem statement
 */

const fetch = require('node-fetch');

const baseUrl = 'http://localhost:8080';

async function simulateOriginalProblem() {
  console.log('🎯 Simulating original problem scenario...\n');

  try {
    // Simulate the exact sequence from the error logs
    let sessionCookies = '';
    
    // 1. Initial page load with auth check (should fail)
    console.log('1. [DEBUG] Auth check attempt 1/4...');
    const initialResponse = await fetch(`${baseUrl}/`);
    const initialCookies = initialResponse.headers.get('set-cookie');
    if (initialCookies) {
      sessionCookies = initialCookies.split(',').map(cookie => cookie.split(';')[0]).join('; ');
    }
    
    const initialAuthResponse = await fetch(`${baseUrl}/auth/user`, {
      headers: { 'Cookie': sessionCookies }
    });
    const initialAuthData = await initialAuthResponse.json();
    
    if (!initialAuthData.authenticated) {
      console.log('   [INFO] User not authenticated - showing login form ✓');
    }

    // 2. Login attempt
    console.log('\n2. Performing login...');
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookies
      },
      body: JSON.stringify({
        username: 'test@example.com',
        password: 'password123',
        rememberMe: true
      })
    });

    const loginData = await loginResponse.json();
    
    // Update cookies
    const loginCookies = loginResponse.headers.get('set-cookie');
    if (loginCookies) {
      const newCookies = loginCookies.split(',').map(cookie => cookie.split(';')[0]);
      const allCookies = sessionCookies.split('; ').concat(newCookies);
      sessionCookies = [...new Set(allCookies.filter(c => c))].join('; ');
    }

    if (loginData.success) {
      console.log('   [DEBUG] Login successful, waiting for session establishment... ✓');
      console.log(`   [DEBUG] Login response: {success: true, message: '${loginData.message}', user: {...}, sessionInfo: {...}} ✓`);
    } else {
      console.log('   ❌ Login failed:', loginData.message);
      return false;
    }

    // 3. The critical test - immediate auth check that was failing before
    console.log('\n3. [DEBUG] Auth check attempt 1/6...');
    const authResponse = await fetch(`${baseUrl}/auth/user`, {
      headers: { 
        'Cookie': sessionCookies,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    const authData = await authResponse.json();
    
    if (authData.authenticated && authData.user) {
      console.log(`   [SUCCESS] User authenticated: ${authData.user.username} ✓`);
      console.log('   🎉 NO RETRIES NEEDED - Authentication works immediately!');
      return true;
    } else {
      console.log('   ❌ [ERROR] Login succeeded but authentication check failed after all retries');
      console.log('   🐛 This would be the original bug - but it should be fixed now!');
      return false;
    }

  } catch (error) {
    console.error('❌ Test error:', error.message);
    return false;
  }
}

if (require.main === module) {
  simulateOriginalProblem().then(success => {
    if (success) {
      console.log('\n✅ SUCCESS: Original authentication timing issue is FIXED!');
      console.log('   The login -> auth check sequence now works immediately without retries.');
    } else {
      console.log('\n❌ FAILURE: Authentication timing issue still exists.');
    }
    process.exit(success ? 0 : 1);
  });
}

module.exports = { simulateOriginalProblem };