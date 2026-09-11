const { Expo } = require('expo-server-sdk');
const prisma = require('../db');

const expo = new Expo();

// Send an Expo push notification to every registered device of the given emails.
async function sendPushToEmails(emails, { title, body, data }) {
  const tokens = await prisma.pushToken.findMany({ where: { user_email: { in: emails } } });
  const messages = tokens
    .filter((t) => Expo.isExpoPushToken(t.token))
    .map((t) => ({ to: t.token, sound: 'default', title, body, data: data || {} }));
  if (messages.length === 0) return { sent: 0 };

  let sent = 0;
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      for (let i = 0; i < receipts.length; i++) {
        if (receipts[i].status === 'ok') sent++;
        else if (receipts[i].details?.error === 'DeviceNotRegistered') {
          await prisma.pushToken.deleteMany({ where: { token: chunk[i].to } });
        }
      }
    } catch (err) {
      console.error('[push] send failed:', err.message);
    }
  }
  return { sent };
}

module.exports = { sendPushToEmails };
