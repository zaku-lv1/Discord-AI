const firebaseService = require("./firebase");

// Simplified user system (Synapse-Note style)
// Users are either admin or regular users (no complex roles)
const USER_TYPES = {
  ADMIN: 'admin',
  USER: 'user'
};

// Display names in Japanese
const TYPE_DISPLAY_NAMES = {
  [USER_TYPES.ADMIN]: '管理者',
  [USER_TYPES.USER]: '一般ユーザー'
};

class RoleService {
  constructor() {
    this.types = USER_TYPES;
    this.displayNames = TYPE_DISPLAY_NAMES;
    
    // Keep legacy role names for backward compatibility
    this.roles = {
      OWNER: 'owner',
      EDITOR: 'editor',
      ADMIN: 'admin',
      USER: 'user'
    };
  }

  /**
   * Convert username to handle format (@username)
   */
  formatHandle(username) {
    if (!username) return null;
    return username.startsWith('@') ? username : `@${username}`;
  }

  /**
   * Extract username from handle format (remove @)
   */
  extractUsername(handle) {
    if (!handle) return null;
    return handle.startsWith('@') ? handle.substring(1) : handle;
  }

  /**
   * Check if user is admin (simplified from role hierarchy)
   */
  isAdmin(user) {
    // Check if user has admin flag
    if (user && user.isAdmin === true) return true;
    
    // Legacy compatibility: check for owner/admin role
    if (user && (user.role === 'owner' || user.role === 'admin')) return true;
    
    return false;
  }
  
  /**
   * Check if user has required role or higher (for backward compatibility)
   */
  hasRole(userRole, requiredRole) {
    // Simplified: admin has all permissions, regular users don't
    if (userRole === 'admin' || userRole === 'owner') return true;
    if (requiredRole === 'editor' || requiredRole === 'user') return true;
    return false;
  }

  /**
   * Get user info by email or handle
   */
  async getUserRole(emailOrHandle) {
    try {
      const db = firebaseService.getDB();
      
      console.log(`[DEBUG] Getting user info for: ${emailOrHandle}`);
      
      // First check in users collection
      let userQuery;
      if (emailOrHandle.includes('@') && emailOrHandle.includes('.')) {
        // Email format
        userQuery = await db.collection('users').where('email', '==', emailOrHandle).get();
      } else {
        // Handle format
        const handle = this.formatHandle(emailOrHandle);
        userQuery = await db.collection('users').where('handle', '==', handle).get();
      }
      
      if (!userQuery.empty) {
        const userData = userQuery.docs[0].data();
        
        // Return admin or user based on isAdmin flag (Synapse-Note style)
        const role = userData.isAdmin ? 'admin' : 'user';
        console.log(`[DEBUG] Found user with role: ${role} (isAdmin: ${userData.isAdmin})`);
        return role;
      }

      console.log(`[DEBUG] User not found in users collection, checking legacy admin system`);
      
      // Fallback: check legacy admin system and migrate to new system
      const settingsDoc = await db.collection("bot_settings").doc("ai_profile").get();
      if (settingsDoc.exists) {
        const admins = settingsDoc.data().admins || [];
        console.log(`[DEBUG] Found ${admins.length} admins in legacy system`);
        
        const admin = admins.find(a => a.email === emailOrHandle);
        if (admin) {
          // First admin in the list is considered admin in new system
          const isFirstAdmin = admins[0].email === emailOrHandle;
          const isAdmin = isFirstAdmin;
          
          console.log(`[DEBUG] Found user in legacy admin system, isAdmin: ${isAdmin}`);
          
          // Try to migrate this user to the new system if they have a handle
          if (admin.handle || admin.username) {
            try {
              const handle = this.formatHandle(admin.handle || admin.username);
              await db.collection('users').add({
                handle: handle,
                username: admin.username || admin.handle,
                email: emailOrHandle,
                isAdmin: isAdmin,
                displayName: admin.name || admin.username,
                verified: true,
                createdAt: firebaseService.getServerTimestamp(),
                migratedFromLegacy: true
              });
              console.log(`[DEBUG] Migrated user ${emailOrHandle} to new system (isAdmin: ${isAdmin})`);
            } catch (migrationError) {
              console.error(`[WARNING] Failed to migrate user ${emailOrHandle}:`, migrationError);
            }
          }
          
          return isAdmin ? 'admin' : 'user';
        }
      }

      console.log(`[DEBUG] User not found in any system, defaulting to user`);
      return 'user';
    } catch (error) {
      console.error('Error getting user role:', error);
      return 'user';
    }
  }

  /**
   * Update user admin status (Synapse-Note style)
   */
  async updateUserRole(emailOrHandle, newRole) {
    try {
      const db = firebaseService.getDB();
      
      // Convert role to admin flag
      const isAdmin = (newRole === 'admin' || newRole === 'owner');

      // Find user
      let userQuery;
      if (emailOrHandle.includes('@') && emailOrHandle.includes('.')) {
        userQuery = await db.collection('users').where('email', '==', emailOrHandle).get();
      } else {
        const handle = this.formatHandle(emailOrHandle);
        userQuery = await db.collection('users').where('handle', '==', handle).get();
      }

      if (userQuery.empty) {
        throw new Error('User not found');
      }

      const userDoc = userQuery.docs[0];
      await userDoc.ref.update({
        isAdmin: isAdmin,
        role: isAdmin ? 'admin' : 'user', // For backward compatibility
        updatedAt: firebaseService.getServerTimestamp()
      });

      return true;
    } catch (error) {
      console.error('Error updating user admin status:', error);
      throw error;
    }
  }

  /**
   * List all users with their admin status (Synapse-Note style)
   */
  async listUsersWithRoles() {
    try {
      const db = firebaseService.getDB();
      const usersSnapshot = await db.collection('users').get();
      
      const users = [];
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        const isAdmin = userData.isAdmin === true;
        const userType = isAdmin ? USER_TYPES.ADMIN : USER_TYPES.USER;
        
        users.push({
          id: doc.id,
          handle: userData.handle || this.formatHandle(userData.username),
          email: userData.email,
          displayName: userData.displayName || userData.username,
          isAdmin: isAdmin,
          role: isAdmin ? 'admin' : 'user', // For backward compatibility
          roleDisplay: this.displayNames[userType],
          verified: userData.verified,
          createdAt: userData.createdAt,
          lastLogin: userData.lastLogin
        });
      });

      // Sort by admin status (admins first), then by creation date
      users.sort((a, b) => {
        const adminCompare = (b.isAdmin ? 1 : 0) - (a.isAdmin ? 1 : 0);
        if (adminCompare !== 0) return adminCompare;
        
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return aDate - bDate;
      });

      return users;
    } catch (error) {
      console.error('Error listing users:', error);
      throw error;
    }
  }

  /**
   * Create invitation code for role
   */
  async createInvitationCode(targetRole, createdBy) {
    try {
      const db = firebaseService.getDB();
      const { v4: uuidv4 } = require("uuid");
      
      const code = uuidv4().split("-")[0].toUpperCase();
      
      await db.collection("invitation_codes").doc(code).set({
        code: code,
        targetRole: targetRole,
        createdAt: firebaseService.getServerTimestamp(),
        createdBy: createdBy,
        used: false,
        usedBy: null,
        usedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      });

      return code;
    } catch (error) {
      console.error('Error creating invitation code:', error);
      throw error;
    }
  }

  /**
   * Use invitation code to upgrade role
   */
  async useInvitationCode(code, userEmailOrHandle) {
    try {
      const db = firebaseService.getDB();
      
      // Get invitation code
      const inviteDoc = await db.collection("invitation_codes").doc(code).get();
      if (!inviteDoc.exists) {
        throw new Error('Invalid invitation code');
      }

      const inviteData = inviteDoc.data();
      if (inviteData.used) {
        throw new Error('Invitation code has already been used');
      }

      if (inviteData.expiresAt && inviteData.expiresAt.toDate() < new Date()) {
        throw new Error('Invitation code has expired');
      }

      // Update user role
      await this.updateUserRole(userEmailOrHandle, inviteData.targetRole);

      // Mark invitation as used
      await inviteDoc.ref.update({
        used: true,
        usedBy: userEmailOrHandle,
        usedAt: firebaseService.getServerTimestamp()
      });

      return {
        success: true,
        newRole: inviteData.targetRole,
        roleDisplay: this.displayNames[inviteData.targetRole]
      };
    } catch (error) {
      console.error('Error using invitation code:', error);
      throw error;
    }
  }
}

module.exports = new RoleService();