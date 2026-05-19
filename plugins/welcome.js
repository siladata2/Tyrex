// plugins/welcome.js – Simplified & professional with poetry
const { isWelcomeOn, getWelcome, addWelcome, delWelcome } = require('../lib/index');
const fetch = require('node-fetch');
const settings = require('../settings');

// Default values
const DEFAULT_BOT_NAME = settings.botName || 'REDXBOT302';
const DEFAULT_OWNER = settings.botOwner || 'Abdul Rehman Rajpoot';

// Fixed image settings (no customisation)
const IMAGE_API = 'https://api.some-random-api.com/welcome/img/2/';
const IMAGE_STYLE = 'gaming3';
const IMAGE_COLOR = 'green';
const USE_AVATAR = true; // always include avatar

// Professional default message with a poetic line
const DEFAULT_MESSAGE = `🌟 *Greetings* {user}! 🌟

🎉 *Welcome to* {group} 🎉

📖 *About the group:*
{description}

⏰ *Joined at:* {time}
👥 *You are member #* {count}

⚙️ *Powered by* {botname}

💫 *A warm welcome to our community.*
*May your days be filled with joy and laughter,
and your journey with us be unforgettable.*

👨‍💻 *Owner:* ${DEFAULT_OWNER}`;

module.exports = {
  command: 'welcome',
  aliases: ['setwelcome'],
  category: 'admin',
  description: 'Configure welcome messages',
  usage: '.welcome [on|off|set <message>]',
  groupOnly: true,
  adminOnly: true,

  async handler(sock, message, args, context) {
    const { chatId } = context;
    const matchText = args.join(' ');

    if (!matchText) {
      // Show current status and help
      const isEnabled = await isWelcomeOn(chatId);
      const status = isEnabled ? '✅ enabled' : '❌ disabled';
      return sock.sendMessage(chatId, {
        text: `📥 *Welcome Message Setup*\n\n` +
          `Status: ${status}\n\n` +
          `*Commands:*\n` +
          `• .welcome on — enable welcome messages\n` +
          `• .welcome off — disable welcome messages\n` +
          `• .welcome set <your message> — set a custom message\n\n` +
          `*Available variables:* {user}, {group}, {description}, {time}, {count}, {botname}\n\n` +
          `*Default message includes a poetic line.*`,
        quoted: message
      });
    }

    const [command, ...args2] = matchText.split(' ');
    const lowerCommand = command.toLowerCase();

    if (lowerCommand === 'on') {
      if (await isWelcomeOn(chatId)) {
        return sock.sendMessage(chatId, { text: '⚠️ Welcome messages are *already enabled*.', quoted: message });
      }
      await addWelcome(chatId, true, DEFAULT_MESSAGE);
      return sock.sendMessage(chatId, { text: '✅ Welcome messages *enabled* with a professional poetic message. Use *.welcome set* to customise.', quoted: message });
    }

    if (lowerCommand === 'off') {
      if (!(await isWelcomeOn(chatId))) {
        return sock.sendMessage(chatId, { text: '⚠️ Welcome messages are *already disabled*.', quoted: message });
      }
      await delWelcome(chatId);
      return sock.sendMessage(chatId, { text: '✅ Welcome messages *disabled*.', quoted: message });
    }

    if (lowerCommand === 'set') {
      const customMessage = args2.join(' ');
      if (!customMessage) {
        return sock.sendMessage(chatId, { text: '⚠️ Please provide a custom welcome message. Example: *.welcome set Welcome {user} to {group}!*', quoted: message });
      }
      await addWelcome(chatId, true, customMessage);
      return sock.sendMessage(chatId, { text: '✅ Custom welcome message *set successfully*.', quoted: message });
    }

    return sock.sendMessage(chatId, {
      text: `❌ Unknown command. Use:\n.welcome on\n.welcome off\n.welcome set <message>`,
      quoted: message
    });
  }
};

// ========== JOIN EVENT HANDLER ==========
async function handleJoinEvent(sock, id, participants) {
  const isEnabled = await isWelcomeOn(id);
  if (!isEnabled) return;

  const customMessage = await getWelcome(id);
  const groupMetadata = await sock.groupMetadata(id);
  const groupName = groupMetadata.subject;
  const groupDesc = groupMetadata.desc || 'No description available';
  const memberCount = groupMetadata.participants.length;

  const botName = settings.botName || DEFAULT_BOT_NAME;
  const channelInfo = {
    contextInfo: {
      forwardingScore: 1,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: settings.channelJid || '120363405513439052@newsletter',
        newsletterName: botName,
        serverMessageId: -1
      }
    }
  };

  for (const participant of participants) {
    try {
      const participantString = typeof participant === 'string' ? participant : (participant.id || participant.toString());
      const user = participantString.split('@')[0];

      // Get display name
      let displayName = user;
      try {
        const contact = await sock.getBusinessProfile(participantString);
        if (contact && contact.name) displayName = contact.name;
        else {
          const userParticipant = groupMetadata.participants.find(p => p.id === participantString);
          if (userParticipant && userParticipant.name) displayName = userParticipant.name;
        }
      } catch (nameError) {
        console.log('Could not fetch display name, using phone number');
      }

      const now = new Date();
      const timeString = now.toLocaleString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      });

      // Build final message using custom or default
      let finalMessage = customMessage || DEFAULT_MESSAGE;
      finalMessage = finalMessage
        .replace(/{user}/g, `@${displayName}`)
        .replace(/{group}/g, groupName)
        .replace(/{description}/g, groupDesc)
        .replace(/{time}/g, timeString)
        .replace(/{count}/g, memberCount)
        .replace(/{botname}/g, botName);

      // Try to generate a welcome image
      try {
        let profilePicUrl = '';
        if (USE_AVATAR) {
          try {
            const profilePic = await sock.profilePictureUrl(participantString, 'image');
            if (profilePic) profilePicUrl = profilePic;
          } catch (profileError) {
            console.log('Could not fetch profile picture');
          }
        }
        if (!profilePicUrl) {
          profilePicUrl = `https://img.pyrocdn.com/dbKUgahg.png`; // default placeholder
        }

        const apiUrl = `${IMAGE_API}${IMAGE_STYLE}?type=join&textcolor=${IMAGE_COLOR}&username=${encodeURIComponent(displayName)}&guildName=${encodeURIComponent(groupName)}&memberCount=${memberCount}&avatar=${encodeURIComponent(profilePicUrl)}`;

        const response = await fetch(apiUrl);
        if (response.ok) {
          const imageBuffer = await response.buffer();
          await sock.sendMessage(id, {
            image: imageBuffer,
            caption: finalMessage,
            mentions: [participantString],
            ...channelInfo
          });
          continue; // image sent, skip text fallback
        }
      } catch (imageError) {
        console.log('Image generation failed, falling back to text');
      }

      // Text fallback
      await sock.sendMessage(id, {
        text: finalMessage,
        mentions: [participantString],
        ...channelInfo
      });
    } catch (error) {
      console.error('Error sending welcome message:', error);
      const participantString = typeof participant === 'string' ? participant : (participant.id || participant.toString());
      const user = participantString.split('@')[0];
      const fallbackMessage = `Welcome @${user} to ${groupName}! 🎉`;
      await sock.sendMessage(id, { text: fallbackMessage, mentions: [participantString], ...channelInfo });
    }
  }
}

module.exports.handleJoinEvent = handleJoinEvent;
