const firebaseService = require("./firebase");

// Define user roles with hierarchy (simplified to OWNER and EDITOR only)
const USER_ROLES = {
  OWNER: 'owner',        // オーナー - full system control including invitation codes and maintenance mode
  EDITOR: 'editor'       // 編集者 - edit content, limited permissions
};

// Role hierarchy (higher number = more permissions)
const ROLE_HIERARCHY = {
  [USER_ROLES.EDITOR]: 1, 
  [USER_ROLES.OWNER]: 2
};

// Role display names in Japanese
const ROLE_DISPLAY_NAMES = {
  [USER_ROLES.OWNER]: 'オーナー',
  [USER_ROLES.EDITOR]: '編集者'
};

class RoleService {
  constructor() {
    this.roles = USER_ROLES;
    this.hierarchy = ROLE_HIERARCHY;
    this.displayNames = ROLE_DISPLAY_NAMES;
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
   * Check if user has required role or higher
   */
  hasRole(userRole, requiredRole) {
    const userLevel = this.hierarchy[userRole] || 0;
    const requiredLevel = this.hierarchy[requiredRole] || 0;
    return userLevel >= requiredLevel;
  }

  /**
   * Get user role by email or handle
   */
  async getUserRole(emailOrHandle) {
    try {
      const db = firebaseService.getDB();
      
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
        const userRole = userData.role || USER_ROLES.EDITOR;
        // Ensure role is valid in simplified system
        if (Object.values(USER_ROLES).includes(userRole)) {
          return userRole;
        }
        // Map old roles to new simplified system
        if (userRole === 'admin' || userRole === 'viewer') {
          return USER_ROLES.EDITOR;
        }
        return USER_ROLES.EDITOR;
      }

      // Fallback: check legacy admin system
      const settingsDoc = await db.collection("bot_settings").doc("toka_profile").get();
      if (settingsDoc.exists) {
        const admins = settingsDoc.data().admins || [];
        const admin = admins.find(a => a.email === emailOrHandle);
        if (admin) {
          return admins[0].email === emailOrHandle ? USER_ROLES.OWNER : USER_ROLES.EDITOR;
        }
      }

      return USER_ROLES.EDITOR;
    } catch (error) {
      console.error('Error getting user role:', error);
      return USER_ROLES.EDITOR;
    }
  }

  /**
   * Update user role (with owner uniqueness constraint)
   */
  async updateUserRole(emailOrHandle, newRole) {
    try {
      const db = firebaseService.getDB();
      
      // Validate role
      if (!Object.values(USER_ROLES).includes(newRole)) {
        throw new Error('Invalid role specified');
      }

      // If trying to assign OWNER role, ensure only one owner exists
      if (newRole === USER_ROLES.OWNER) {
        const existingOwners = await db.collection('users').where('role', '==', USER_ROLES.OWNER).get();
        if (!existingOwners.empty) {
          throw new Error('システムには既にオーナーが存在します。オーナーは1人だけです。');
        }
      }

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
        role: newRole,
        updatedAt: firebaseService.getServerTimestamp()
      });

      return true;
    } catch (error) {
      console.error('Error updating user role:', error);
      throw error;
    }
  }

  /**
   * List all users with their roles
   */
  async listUsersWithRoles() {
    try {
      const db = firebaseService.getDB();
      const usersSnapshot = await db.collection('users').get();
      
      const users = [];
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        let userRole = userData.role || USER_ROLES.EDITOR;
        
        // Map old roles to simplified system
        if (userRole === 'admin' || userRole === 'viewer') {
          userRole = USER_ROLES.EDITOR;
        }
        
        // Ensure role is valid in simplified system
        if (!Object.values(USER_ROLES).includes(userRole)) {
          userRole = USER_ROLES.EDITOR;
        }
        
        users.push({
          id: doc.id,
          handle: userData.handle || this.formatHandle(userData.username),
          email: userData.email,
          displayName: userData.displayName || userData.username,
          role: userRole,
          roleDisplay: this.displayNames[userRole],
          verified: userData.verified,
          createdAt: userData.createdAt,
          lastLogin: userData.lastLogin
        });
      });

      // Sort by role hierarchy (highest first), then by creation date
      users.sort((a, b) => {
        const roleCompare = (this.hierarchy[b.role] || 0) - (this.hierarchy[a.role] || 0);
        if (roleCompare !== 0) return roleCompare;
        
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return aDate - bDate;
      });

      return users;
    } catch (error) {
      console.error('Error listing users with roles:', error);
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