#!/usr/bin/env node
/**
 * Test script to verify that role change and invitation code usage functionality has been removed
 * Run with: node test_role_restrictions.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Role Change and Invitation Code Usage Removal');
console.log('=========================================================');
console.log('');

// Test 1: Verify invitation code usage section is removed from HTML
function testInvitationUsageRemovedFromHTML() {
  console.log('📋 Test 1: Invitation code usage section removed from HTML');
  
  const indexPath = path.join(__dirname, 'views', 'index.ejs');
  const htmlContent = fs.readFileSync(indexPath, 'utf8');
  
  // Check that invitation code usage section is not present
  assert(!htmlContent.includes('招待コードを使用'), 'Invitation code usage section should be removed');
  assert(!htmlContent.includes('use-invitation-code'), 'Use invitation code input should be removed');
  assert(!htmlContent.includes('use-invite-btn'), 'Use invitation button should be removed');
  
  console.log('   ✅ Invitation code usage section successfully removed from HTML');
}

// Test 2: Verify role change elements are removed from HTML
function testRoleChangeElementsRemovedFromHTML() {
  console.log('📋 Test 2: Role change elements removed from HTML user display');
  
  const appJsPath = path.join(__dirname, 'public', 'app.js');
  const jsContent = fs.readFileSync(appJsPath, 'utf8');
  
  // Check that role change functionality is removed
  assert(!jsContent.includes('change-role-btn'), 'Change role button should be removed');
  assert(!jsContent.includes('role-selector'), 'Role selector should be removed');
  assert(!jsContent.includes('canChangeRole'), 'canChangeRole logic should be removed');
  
  console.log('   ✅ Role change elements successfully removed from HTML');
}

// Test 3: Verify JavaScript handlers are removed
function testJavaScriptHandlersRemoved() {
  console.log('📋 Test 3: JavaScript event handlers removed');
  
  const appJsPath = path.join(__dirname, 'public', 'app.js');
  const jsContent = fs.readFileSync(appJsPath, 'utf8');
  
  // Check that JavaScript handlers are removed
  assert(!jsContent.includes('handleRoleChange'), 'handleRoleChange function should be removed');
  assert(!jsContent.includes('useInviteBtn'), 'useInviteBtn references should be removed');
  assert(!jsContent.includes('use-invitation-code'), 'use-invitation-code references should be removed');
  
  console.log('   ✅ JavaScript event handlers successfully removed');
}

// Test 4: Verify API endpoints are removed
function testAPIEndpointsRemoved() {
  console.log('📋 Test 4: API endpoints for role changes removed');
  
  const roleManagementPath = path.join(__dirname, 'routes', 'role-management.js');
  const routeContent = fs.readFileSync(roleManagementPath, 'utf8');
  
  // Check that API endpoints are removed
  assert(!routeContent.includes('router.put("/users/:identifier/role"'), 'User role update endpoint should be removed');
  assert(!routeContent.includes('router.post("/use-invitation-code"'), 'Use invitation code endpoint should be removed');
  
  console.log('   ✅ API endpoints successfully removed');
}

// Test 5: Verify invitation code generation is still available
function testInvitationGenerationStillAvailable() {
  console.log('📋 Test 5: Invitation code generation still available');
  
  const indexPath = path.join(__dirname, 'views', 'index.ejs');
  const htmlContent = fs.readFileSync(indexPath, 'utf8');
  
  const roleManagementPath = path.join(__dirname, 'routes', 'role-management.js');
  const routeContent = fs.readFileSync(roleManagementPath, 'utf8');
  
  // Check that invitation code generation is still available
  assert(htmlContent.includes('招待コードを生成'), 'Invitation code generation should still be available');
  assert(routeContent.includes('router.post("/invitation-codes"'), 'Invitation code generation endpoint should still exist');
  assert(routeContent.includes('編集者の招待コードのみ作成できます'), 'Should only allow editor invitation codes');
  
  console.log('   ✅ Invitation code generation properly maintained');
}

// Test 6: Verify owner transfer functionality is preserved
function testOwnerTransferPreserved() {
  console.log('📋 Test 6: Owner transfer functionality preserved');
  
  const indexPath = path.join(__dirname, 'views', 'index.ejs');
  const htmlContent = fs.readFileSync(indexPath, 'utf8');
  
  // Check that owner transfer is still available
  assert(htmlContent.includes('オーナー権限移譲'), 'Owner transfer should still be available');
  assert(htmlContent.includes('ownership-transfer-form'), 'Owner transfer form should exist');
  
  console.log('   ✅ Owner transfer functionality properly preserved');
}

// Run all tests
try {
  testInvitationUsageRemovedFromHTML();
  testRoleChangeElementsRemovedFromHTML();
  testJavaScriptHandlersRemoved();
  testAPIEndpointsRemoved();
  testInvitationGenerationStillAvailable();
  testOwnerTransferPreserved();
  
  console.log('');
  console.log('🎉 All tests passed!');
  console.log('');
  console.log('✅ Requirements fulfilled:');
  console.log('   ✓ 招待コードを使用する場所を削除 (Invitation code usage places removed)');
  console.log('   ✓ ユーザーのロールを変更する場所を削除 (User role change places removed)');
  console.log('   ✓ 招待コード生成は維持 (Invitation code generation maintained)');
  console.log('   ✓ オーナー権限移譲は維持 (Owner transfer maintained)');
  console.log('');
  console.log('🌟 Role restrictions implementation complete!');
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}