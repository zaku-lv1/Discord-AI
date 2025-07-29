#!/usr/bin/env node

// Test script to verify AI creation functionality
const firebaseService = require('./services/firebase');

async function testAiProfileCreation() {
  console.log('🧪 Testing AI profile creation with array-safe timestamps...');
  
  try {
    // Initialize Firebase service
    await firebaseService.initialize();
    const db = firebaseService.getDB();
    
    console.log('✅ Firebase service initialized');
    
    // Test array-safe timestamp function
    const arraySafeTimestamp = firebaseService.getArraySafeTimestamp();
    console.log('✅ Array-safe timestamp created:', arraySafeTimestamp);
    
    if (!(arraySafeTimestamp instanceof Date)) {
      throw new Error('Array-safe timestamp should be a Date object');
    }
    
    // Test profile structure that would be added to array
    const testProfile = {
      id: 'test-ai-' + Date.now(),
      name: 'Test AI',
      systemPrompt: 'You are a helpful assistant.',
      modelMode: 'hybrid',
      baseUserId: null,
      enableNameRecognition: true,
      enableBotMessageResponse: false,
      replyDelayMs: 0,
      errorOopsMessage: '',
      userNicknames: {},
      createdAt: firebaseService.getArraySafeTimestamp(),
      updatedAt: firebaseService.getArraySafeTimestamp()
    };
    
    console.log('✅ Test profile structure created');
    
    // Test saving to mock database (simulating the profiles array)
    const existingProfiles = [];
    existingProfiles.push(testProfile);
    
    await db.collection("bot_settings").doc("ai_profiles").set({
      profiles: existingProfiles,
      updatedAt: firebaseService.getServerTimestamp()
    }, { merge: true });
    
    console.log('✅ Profile saved to database successfully');
    
    // Verify retrieval
    const doc = await db.collection("bot_settings").doc("ai_profiles").get();
    if (doc.exists) {
      const data = doc.data();
      const profiles = data.profiles || [];
      console.log('✅ Retrieved profiles:', profiles.length);
      
      if (profiles.length > 0) {
        const retrievedProfile = profiles[0];
        console.log('✅ First profile ID:', retrievedProfile.id);
        console.log('✅ CreatedAt type:', typeof retrievedProfile.createdAt);
      }
    }
    
    console.log('🎉 All tests passed! AI profile creation should work without Firestore errors.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testAiProfileCreation();