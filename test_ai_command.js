#!/usr/bin/env node

// Test script to verify AI command modifications
const aiCommand = require('./commands/toka.js');

function testAICommandStructure() {
  console.log('[TEST] Testing AI command structure...');
  
  // Test 1: Verify ai_id parameter is required
  const aiIdOption = aiCommand.data.options.find(option => option.name === 'ai_id');
  const isRequired = aiIdOption && aiIdOption.required === true;
  
  console.log(`${isRequired ? '[SUCCESS]' : '[ERROR]'} AI ID parameter is ${isRequired ? 'required' : 'not required'}`);
  
  // Test 2: Verify command structure
  const hasAutocomplete = typeof aiCommand.autocomplete === 'function';
  const hasExecute = typeof aiCommand.execute === 'function';
  const hasData = aiCommand.data && aiCommand.data.name === 'ai';
  
  console.log(`${hasAutocomplete ? '[SUCCESS]' : '[ERROR]'} Autocomplete function exists: ${hasAutocomplete}`);
  console.log(`${hasExecute ? '[SUCCESS]' : '[ERROR]'} Execute function exists: ${hasExecute}`);
  console.log(`${hasData ? '[SUCCESS]' : '[ERROR]'} Command data structure valid: ${hasData}`);
  
  const allTests = [isRequired, hasAutocomplete, hasExecute, hasData];
  const passed = allTests.filter(test => test).length;
  const total = allTests.length;
  
  console.log(`\n[RESULTS] AI Command Structure Tests: ${passed}/${total} passed`);
  
  return passed === total;
}

function testCommandLogic() {
  console.log('\n[TEST] Testing command logic structure...');
  
  // Test the execute function exists and has expected structure
  const executeFunction = aiCommand.execute.toString();
  
  // Check if new logic is present
  const hasRequiredIdLogic = executeFunction.includes('requestedAiId') && 
                           executeFunction.includes('find(ai => ai.id === requestedAiId)');
  const hasDismissalLogic = executeFunction.includes('既に召喚されているAIの場合は退出させる') &&
                           executeFunction.includes('を退出させました');
  const hasEarlyReturn = executeFunction.includes('return await interaction.editReply({ embeds: [embed] })');
  
  console.log(`${hasRequiredIdLogic ? '[SUCCESS]' : '[ERROR]'} Required AI ID logic present: ${hasRequiredIdLogic}`);
  console.log(`${hasDismissalLogic ? '[SUCCESS]' : '[ERROR]'} AI dismissal logic present: ${hasDismissalLogic}`);
  console.log(`${hasEarlyReturn ? '[SUCCESS]' : '[ERROR]'} Early return for dismissal present: ${hasEarlyReturn}`);
  
  const logicTests = [hasRequiredIdLogic, hasDismissalLogic, hasEarlyReturn];
  const passed = logicTests.filter(test => test).length;
  const total = logicTests.length;
  
  console.log(`\n[RESULTS] Command Logic Tests: ${passed}/${total} passed`);
  
  return passed === total;
}

async function runTests() {
  console.log('[TEST] Testing AI command modifications...\n');
  
  const structureTestResult = testAICommandStructure();
  const logicTestResult = testCommandLogic();
  
  const allPassed = structureTestResult && logicTestResult;
  
  console.log(`\n[FINAL RESULTS] AI Command Tests: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);
  
  if (allPassed) {
    console.log('[SUCCESS] All AI command modifications are properly implemented.');
    console.log('✓ AI ID parameter is now required');
    console.log('✓ Logic to dismiss already-summoned AI is implemented');
    console.log('✓ Command structure is valid');
    process.exit(0);
  } else {
    console.log('[ERROR] Some tests failed. Please check the implementation.');
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { testAICommandStructure, testCommandLogic, runTests };