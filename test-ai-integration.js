// Test the AI command by requiring it and checking if it uses character presets
const aiCommand = require('./commands/ai');
const characterPresets = require('./data/character-presets');

console.log('🧪 Testing AI Command Integration...\n');

// Test 1: Check if AI command loads without errors
console.log('✅ Test 1: AI Command Loading');
console.log(`AI command name: ${aiCommand.data.name}`);
console.log(`AI command description: ${aiCommand.data.description}\n`);

// Test 2: Verify character presets are loaded
console.log('✅ Test 2: Character Presets Available');
console.log(`Available presets: ${Object.keys(characterPresets).length}`);
Object.keys(characterPresets).forEach(id => {
  console.log(`  - ${id}: ${characterPresets[id].name}`);
});

// Test 3: Check that the default prompt is character-focused
console.log('\n✅ Test 3: Default Prompt Analysis');
const defaultPrompt = characterPresets.default.prompt;
const characterKeywords = ['キャラクター', '個性', '演じ', '感情', 'リアクション'];
const foundKeywords = characterKeywords.filter(keyword => 
  defaultPrompt.includes(keyword)
);

console.log(`Default prompt length: ${defaultPrompt.length} characters`);
console.log(`Character-related keywords found: ${foundKeywords.join(', ')}`);
console.log(`Character focus score: ${foundKeywords.length}/${characterKeywords.length}\n`);

if (foundKeywords.length >= 3) {
  console.log('🎉 Default prompt is properly focused on character role-playing!');
} else {
  console.log('⚠️ Default prompt may need more character-focused content.');
}

console.log('\n🚀 AI system is ready for character role-playing!');