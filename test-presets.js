const characterPresets = require('./data/character-presets');

console.log('🧪 Testing Character Presets...\n');

// Test 1: Check if presets object exists and has expected structure
console.log('✅ Test 1: Checking presets structure');
console.log(`Found ${Object.keys(characterPresets).length} presets:`);

Object.entries(characterPresets).forEach(([id, preset]) => {
  console.log(`  - ${id}: ${preset.name}`);
  console.log(`    Description: ${preset.description}`);
  console.log(`    Prompt length: ${preset.prompt.length} characters\n`);
});

// Test 2: Check if default prompt is properly loaded
console.log('✅ Test 2: Testing default prompt');
const defaultPrompt = characterPresets.default.prompt;
console.log('Default prompt preview (first 200 chars):');
console.log(defaultPrompt.substring(0, 200) + '...\n');

// Test 3: Check if all presets have required fields
console.log('✅ Test 3: Validating preset structure');
let allValid = true;
Object.entries(characterPresets).forEach(([id, preset]) => {
  const requiredFields = ['name', 'description', 'prompt'];
  const missingFields = requiredFields.filter(field => !preset[field]);
  
  if (missingFields.length > 0) {
    console.log(`❌ Preset "${id}" missing fields: ${missingFields.join(', ')}`);
    allValid = false;
  } else {
    console.log(`✅ Preset "${id}" has all required fields`);
  }
});

if (allValid) {
  console.log('\n🎉 All character presets are valid!');
} else {
  console.log('\n❌ Some presets have issues!');
}

console.log('\n🚀 Character presets are ready for use in the Discord AI system!');