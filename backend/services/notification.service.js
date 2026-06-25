import { Expo } from 'expo-server-sdk';
import { promisePool } from '../lib/db.js';

const expo = new Expo();

export const NotificationService = {
  async updateUserPushToken(userId, pushToken, platform = null) {
    try {
      if (!Expo.isExpoPushToken(pushToken)) throw new Error('Invalid Expo push token');
      await promisePool.query('UPDATE users SET push_token = $1, device_type = $2 WHERE id = $3', [pushToken, platform, userId]);
      return { success: true };
    } catch (error) { return { success: false, error: error.message }; }
  },

  async removeUserPushToken(userId) {
    try {
      await promisePool.query('UPDATE users SET push_token = NULL, device_type = NULL WHERE id = $1', [userId]);
      return { success: true };
    } catch (error) { return { success: false, error: error.message }; }
  },

  async saveNotificationToDatabase(userId, title, body, data = {}) {
    try {
      await promisePool.query(
        `INSERT INTO notifications (user_id, title, body, data, is_read, created_at)
         VALUES ($1, $2, $3, $4, false, NOW())`,
        [userId, title, body, JSON.stringify(data)]
      );
    } catch (error) { console.error('Error saving notification:', error); }
  },

  async sendPushNotification(userId, title, body, data = {}) {
    try {
      const result = await promisePool.query('SELECT push_token FROM users WHERE id = $1 AND push_token IS NOT NULL', [userId]);
      if (result.rows.length === 0 || !result.rows[0].push_token) return { success: false, message: 'No push token found' };

      const pushToken = result.rows[0].push_token;
      if (!Expo.isExpoPushToken(pushToken)) return { success: false, message: 'Invalid push token' };

      await expo.sendPushNotificationsAsync([{ to: pushToken, sound: 'default', title, body, data, priority: 'high', badge: 1 }]);
      await this.saveNotificationToDatabase(userId, title, body, data);

      return { success: true };
    } catch (error) { return { success: false, error: error.message }; }
  },

  async sendPushNotificationByName(userName, title, body, data = {}) {
    try {
      const result = await promisePool.query('SELECT id, push_token FROM users WHERE name = $1', [userName]);
      if (result.rows.length === 0) return { success: false, message: 'User not found' };
      if (!result.rows[0].push_token) return { success: false, message: 'User has no push token' };
      return await this.sendPushNotification(result.rows[0].id, title, body, data);
    } catch (error) { return { success: false, error: error.message }; }
  },

  // --- UPDATED BATCH FUNCTION ---
  async sendBatchNotifications(filter, title, body, data = {}, batchSize = 50, delayMs = 1000) {
    try {
      let query = 'SELECT id, push_token, name FROM users WHERE active = true';
      const params = [];
      
      if (filter.role) {
        params.push(filter.role);
        query += ` AND title = $${params.length}`; 
      }
      if (filter.region) {
        params.push(filter.region);
        query += ` AND region = $${params.length}`;
      }
      
      query += ' AND push_token IS NOT NULL';
      
      const result = await promisePool.query(query, params);
      
      if (result.rows.length === 0) {
        return { success: false, message: 'No users found', totalUsers: 0, sentCount: 0, failedCount: 0 };
      }

      const users = result.rows;
      const batches = this.chunkArray(users, batchSize);
      
      let sentCount = 0;
      let failedCount = 0;
      const failedUsers = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const messages = [];
        const validUsers = [];
        
        for (const user of batch) {
          if (Expo.isExpoPushToken(user.push_token)) {
            messages.push({ to: user.push_token, sound: 'default', title, body, data, priority: 'high', badge: 1 });
            validUsers.push(user);
          } else {
            failedCount++;
            failedUsers.push({ id: user.id, name: user.name, reason: 'Invalid push token' });
          }
        }

        if (messages.length > 0) {
          try {
            await expo.sendPushNotificationsAsync(messages);
            // Notice: We removed the loop saving to the DB here!
            sentCount += validUsers.length;
          } catch (error) {
            failedCount += validUsers.length;
            validUsers.forEach(user => failedUsers.push({ id: user.id, name: user.name, reason: 'Send failed' }));
          }
        }

        if (i < batches.length - 1) await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      // SAVE EXACTLY 1 ROW FOR THE ENTIRE BROADCAST! 
      if (sentCount > 0) {
        await promisePool.query(
          `INSERT INTO notifications (user_id, title, body, data, is_read, created_at)
           VALUES (NULL, $1, $2, $3, false, NOW())`,
          [title, body, JSON.stringify({ ...data, target_filter: filter })]
        );
      }

      return {
        success: sentCount > 0,
        message: `Sent to ${sentCount} users, ${failedCount} failed`,
        totalUsers: users.length,
        sentCount,
        failedCount,
        failedUsers: failedUsers.length > 0 ? failedUsers : undefined
      };
    } catch (error) { return { success: false, error: error.message, totalUsers: 0, sentCount: 0, failedCount: 0 }; }
  },

  async sendToAllUsers(title, body, data = {}, batchSize = 100, delayMs = 500) {
    return await this.sendBatchNotifications({}, title, body, data, batchSize, delayMs);
  },

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
    return chunks;
  }
};

export default NotificationService;