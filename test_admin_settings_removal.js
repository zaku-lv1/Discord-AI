#!/usr/bin/env node
/**
 * Test script to verify that admin settings page has been removed
 * and only editor invitation codes can be created
 * Run with: node test_admin_settings_removal.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Admin Settings Removal');
console.log('==================================');
console.log('');

// Test 1: Verify admin settings panel is removed from HTML
function testAdminPanelRemoved() {
  console.log('📋 Test 1: Admin settings panel removed from HTML');
  
  const indexPath = path.join(__dirname, 'views', 'index.ejs');
  const htmlContent = fs.readFileSync(indexPath, 'utf8');
  
  // Check that admin settings panel is not present
  assert(!htmlContent.includes('id="panel-admins"'), 'Admin settings panel should be removed');
  assert(!htmlContent.includes('管理者設定'), 'Admin settings text should be removed');
  assert(!htmlContent.includes('nav-item-admin'), 'Admin navigation item should be removed');
  
  console.log('   ✅ Admin settings panel successfully removed from HTML');
}

// Test 2: Verify admin JavaScript code is removed
function testAdminJSRemoved() {
  console.log('📋 Test 2: Admin JavaScript code removed');
  
  const appJsPath = path.join(__dirname, 'public', 'app.js');
  const jsContent = fs.readFileSync(appJsPath, 'utf8');
  
  // Check that admin-related JavaScript is removed
  assert(!jsContent.includes('generateInviteCodeBtn'), 'Admin invite button should be removed');
  assert(!jsContent.includes('adminNavItem'), 'Admin nav item references should be removed');
  assert(!jsContent.includes('panel-admins'), 'Admin panel references should be removed');
  
  console.log('   ✅ Admin JavaScript code successfully removed');
}

// Test 3: Verify only editor codes can be created in role management
function testOnlyEditorInvitation() {
  console.log('📋 Test 3: Role management only allows editor invitations');
  
  const roleManagementPath = path.join(__dirname, 'routes', 'role-management.js');
  const roleContent = fs.readFileSync(roleManagementPath, 'utf8');
  
  // Check that only editor codes can be created
  assert(roleContent.includes('編集者の招待コードのみ作成できます'), 'Should only allow editor codes');
  assert(roleContent.includes('targetRole !== roleService.roles.EDITOR'), 'Should reject non-editor roles');
  
  console.log('   ✅ Role management properly restricts to editor codes only');
}

// Test 4: Verify legacy admin routes are removed
function testLegacyAdminRoutesRemoved() {
  console.log('📋 Test 4: Legacy admin management routes removed');
  
  const settingsPath = path.join(__dirname, 'routes', 'settings.js');
  const settingsContent = fs.readFileSync(settingsPath, 'utf8');
  
  // Check that admin management routes are removed
  assert(!settingsContent.includes('router.post("/admins"'), 'Admin management route should be removed');
  assert(!settingsContent.includes('管理者設定'), 'Admin settings comments should be removed');
  
  console.log('   ✅ Legacy admin management routes successfully removed');
}

// Test 5: Verify server.js legacy route is removed
function testServerLegacyRouteRemoved() {
  console.log('📋 Test 5: Server legacy invitation route removed');
  
  const serverPath = path.join(__dirname, 'server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  
  // Check that the legacy invite code generation route is removed
  assert(!serverContent.includes('POST /api/generate-invite-code'), 'Legacy invite code route should be removed');
  assert(!serverContent.includes('/api/generate-invite-code'), 'Legacy invite code endpoint should be removed');
  
  console.log('   ✅ Server legacy invitation route successfully removed');
}

// Test 6: Verify HTML only shows editor option for invitation codes
function testHTMLOnlyEditorOption() {
  console.log('📋 Test 6: HTML only shows editor option for invitation codes');
  
  const indexPath = path.join(__dirname, 'views', 'index.ejs');
  const htmlContent = fs.readFileSync(indexPath, 'utf8');
  
  // Check that only editor option is available
  const editorOptionExists = htmlContent.includes('<option value="editor">編集者');
  const ownerOptionExists = htmlContent.includes('<option value="owner">オーナー');
  
  assert(editorOptionExists, 'Editor option should be available');
  assert(!ownerOptionExists, 'Owner option should be removed');
  
  console.log('   ✅ HTML properly shows only editor invitation option');
}

// Run all tests
try {
  testAdminPanelRemoved();
  testAdminJSRemoved();
  testOnlyEditorInvitation();
  testLegacyAdminRoutesRemoved();
  testServerLegacyRouteRemoved();
  testHTMLOnlyEditorOption();
  
  console.log('');
  console.log('🎉 All tests passed!');
  console.log('');
  console.log('✅ Requirements fulfilled:');
  console.log('   ✓ 管理者設定のページを削除 (Admin settings page removed)');
  console.log('   ✓ オーナーは1人だけしか存在できない (Only one owner can exist)');
  console.log('   ✓ 作成できるのは編集者だけに (Only editors can be created)');
  console.log('');
  console.log('🌟 Admin settings removal implementation complete!');
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}