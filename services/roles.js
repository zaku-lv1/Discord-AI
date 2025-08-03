const firebaseService = require("./firebase");

// Define user roles - simplified to OWNER and EDITOR only
const USER_ROLES = {
  OWNER: 'owner',        // オーナー - full system control
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
   * Check if user has required role or higher
   */
  hasRole(userRole, requiredRole) {
    const userLevel = this.hierarchy[userRole] || 0;
    const requiredLevel = this.hierarchy[requiredRole] || 0;
    return userLevel >= requiredLevel;
  }

  /**
   * Get user role by email - simplified, no migration logic
   */
  async getUserRole(email) {
    try {
      const db = firebaseService.getDB();
      
      console.log(`[DEBUG] Getting user role for: ${email}`);
      
      // Check in users collection only
      const userQuery = await db.collection('users').where('email', '==', email).get();
      
      if (!userQuery.empty) {
        const userData = userQuery.docs[0].data();
        const userRole = userData.role || USER_ROLES.EDITOR;
        console.log(`[DEBUG] Found user with role: ${userRole}`);
        
        // Ensure role is valid
        if (Object.values(USER_ROLES).includes(userRole)) {
          return userRole;
        }
      }

      console.log(`[DEBUG] User not found, defaulting to editor`);
      return USER_ROLES.EDITOR;
    } catch (error) {
      console.error('Error getting user role:', error);
      return USER_ROLES.EDITOR;
    }
  }

  /**
   * Update user role - simplified
   */
  async updateUserRole(email, newRole) {
    try {
      const db = firebaseService.getDB();
      
      // Validate role
      if (!Object.values(USER_ROLES).includes(newRole)) {
        throw new Error('Invalid role specified');
      }

      // Find user by email
      const userQuery = await db.collection('users').where('email', '==', email).get();
      
      if (userQuery.empty) {
        throw new Error('User not found');
      }

      // Update role
      const userDoc = userQuery.docs[0];
      await userDoc.ref.update({
        role: newRole,
        updatedAt: firebaseService.getServerTimestamp()
      });

      console.log(`[INFO] Updated user ${email} role to ${newRole}`);
      
    } catch (error) {
      console.error('Error updating user role:', error);
      throw error;
    }
  }

  /**
   * List all users with their roles - simplified
   */
  async listUsersWithRoles() {
    try {
      const db = firebaseService.getDB();
      const usersSnapshot = await db.collection('users').get();
      
      const users = [];
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        let userRole = userData.role || USER_ROLES.EDITOR;
        
        // Ensure role is valid
        if (!Object.values(USER_ROLES).includes(userRole)) {
          userRole = USER_ROLES.EDITOR;
        }
        
        users.push({
          id: doc.id,
          username: userData.username,
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
  async useInvitationCode(code, userEmail) {
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
      await this.updateUserRole(userEmail, inviteData.targetRole);

      // Mark invitation as used
      await inviteDoc.ref.update({
        used: true,
        usedBy: userEmail,
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