#!/usr/bin/env node
/**
 * Gmail SMTP Configuration Test Script
 * Tests the Gmail SMTP configuration for the Discord AI Bot
 */

const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

// Load environment variables
dotenv.config();

console.log('🧪 Gmail SMTP Configuration Test');
console.log('==================================');

async function testGmailConfiguration() {
  console.log('\n📋 Checking environment variables...');
  
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser) {
    console.log('❌ GMAIL_USER environment variable is not set');
    return false;
  }

  if (!gmailAppPassword) {
    console.log('❌ GMAIL_APP_PASSWORD environment variable is not set');
    return false;
  }

  console.log(`✅ GMAIL_USER: ${gmailUser}`);
  console.log('✅ GMAIL_APP_PASSWORD: [HIDDEN]');

  // Check if using example/test values
  if (gmailUser.includes('your-gmail-address') || 
      gmailUser.includes('test') || 
      gmailAppPassword.includes('your-gmail-app-password') ||
      gmailAppPassword.includes('test')) {
    console.log('\n⚠️  Using example/test Gmail configuration');
    console.log('   Gmail functionality will be disabled in the application');
    console.log('   This is expected in development/test environments');
    return true;
  }

  console.log('\n📋 Testing Gmail SMTP connection...');

  try {
    // Create transporter
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: gmailUser,
        pass: gmailAppPassword
      }
    });

    // Test connection with timeout
    console.log('   Attempting connection to smtp.gmail.com:587...');
    
    const verifyPromise = transporter.verify();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout (10 seconds)')), 10000)
    );
    
    await Promise.race([verifyPromise, timeoutPromise]);

    console.log('✅ Gmail SMTP connection successful!');
    console.log('   Email functionality will be enabled in the application');
    
    return true;
  } catch (error) {
    console.log('❌ Gmail SMTP connection failed:', error.message);
    console.log('\n🔧 Troubleshooting tips:');
    console.log('   1. Ensure 2-step verification is enabled on your Gmail account');
    console.log('   2. Generate an App Password (not your regular Gmail password)');
    console.log('   3. Use the App Password in GMAIL_APP_PASSWORD environment variable');
    console.log('   4. Check your internet connection');
    console.log('   5. Verify Gmail account is not blocked or restricted');
    console.log('\n📖 Detailed setup guide: ./GMAIL_SETUP.md');
    
    return false;
  }
}

async function main() {
  try {
    const success = await testGmailConfiguration();
    
    console.log('\n📊 Test Summary');
    console.log('================');
    
    if (success) {
      console.log('🎉 Gmail configuration test completed successfully!');
      process.exit(0);
    } else {
      console.log('❌ Gmail configuration test failed');
      console.log('   The application will run with email functionality disabled');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Unexpected error during Gmail test:', error);
    process.exit(1);
  }
}

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n\n🛑 Test interrupted by user');
  process.exit(0);
});

// Run the test
main();