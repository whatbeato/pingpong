require('dotenv').config();
const { App } = require('@slack/bolt');

// Configuration
const USERGROUP_ID = 'S09M5G46ASW'; // @leaders-ping group ID

// Admin Slack IDs who can add/remove others
// Submit a PR to add yourself to this list
const ADMIN_IDS = [
  'U07ULNFPQ4T',
  'U0926UASBJ7',
  'U07HEH4N8UV',
  'U04K5EPMZM1',
  'U020X4GCWSF',
  'U0828FYS2UC',
  'U08BH57AZKP',
  'U07UV4R2G4T',
  'U0824G9PTFE',
  'U083VVA9M0W',
];

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Helper: Check if user is admin
function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

// Helper: Extract user ID from mention or raw ID
function extractUserId(text) {
  // Match <@U12345|username> or <@U12345> format
  const mentionMatch = text.match(/<@([A-Z0-9]+)(?:\|[^>]+)?>/);
  if (mentionMatch) return mentionMatch[1];
  
  // Match raw user ID (starts with U)
  const rawMatch = text.match(/\b(U[A-Z0-9]{8,})\b/);
  if (rawMatch) return rawMatch[1];
  
  return null;
}

// Helper: Extract multiple user IDs from text (for mass operations)
function extractMultipleUserIds(text) {
  const userIds = new Set();
  
  // Match all <@U12345|username> or <@U12345> formats
  const mentionMatches = text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g);
  for (const match of mentionMatches) {
    userIds.add(match[1]);
  }
  
  // Match all raw user IDs (starts with U, 9-11 chars)
  const rawMatches = text.matchAll(/\b(U[A-Z0-9]{8,})/g);
  for (const match of rawMatches) {
    userIds.add(match[1]);
  }
  
  return Array.from(userIds);
}

// Helper: Add multiple users to the group
async function addMultipleUsersToGroup(client, userIds) {
  const members = await getUsergroupMembers(client);
  const results = {
    added: [],
    alreadyMembers: [],
    failed: []
  };
  
  const newMembers = [...members];
  
  for (const userId of userIds) {
    if (members.includes(userId)) {
      results.alreadyMembers.push(userId);
    } else {
      newMembers.push(userId);
      results.added.push(userId);
    }
  }
  
  if (results.added.length > 0) {
    try {
      await updateUsergroupMembers(client, newMembers);
    } catch (error) {
      // If update fails, move all added to failed
      results.failed = results.added;
      results.added = [];
      throw error;
    }
  }
  
  return results;
}

// Helper: Get current members of the usergroup
async function getUsergroupMembers(client) {
  try {
    const result = await client.usergroups.users.list({
      usergroup: USERGROUP_ID,
    });
    return result.users || [];
  } catch (error) {
    console.error('Error fetching usergroup members:', error);
    throw error;
  }
}

// Helper: Update usergroup members
async function updateUsergroupMembers(client, members) {
  try {
    await client.usergroups.users.update({
      usergroup: USERGROUP_ID,
      users: members.join(','),
    });
    return true;
  } catch (error) {
    console.error('Error updating usergroup members:', error);
    throw error;
  }
}

// Helper: Add a user to the group
async function addUserToGroup(client, userId) {
  const members = await getUsergroupMembers(client);
  
  if (members.includes(userId)) {
    return { success: false, reason: 'already_member' };
  }
  
  members.push(userId);
  await updateUsergroupMembers(client, members);
  return { success: true };
}

// Helper: Remove a user from the group
async function removeUserFromGroup(client, userId) {
  const members = await getUsergroupMembers(client);
  
  if (!members.includes(userId)) {
    return { success: false, reason: 'not_member' };
  }
  
  const updatedMembers = members.filter(id => id !== userId);
  
  // Slack requires at least one member in a usergroup
  if (updatedMembers.length === 0) {
    return { success: false, reason: 'last_member' };
  }
  
  await updateUsergroupMembers(client, updatedMembers);
  return { success: true };
}

// Slash command: /leaders
app.command('/leaders-ping', async ({ command, ack, respond, client }) => {
  await ack();
  
  const userId = command.user_id;
  const args = command.text.trim().split(/\s+/);
  const action = args[0]?.toLowerCase();
  
  try {
    switch (action) {
      case 'join': {
        const result = await addUserToGroup(client, userId);
        if (result.success) {
          await respond({
            response_type: 'ephemeral',
            text: `:white_check_mark: you've been added to the Leader's Pings group! you'll now receive pings when the Clubs team posts cool announcements. use \`/leaders-ping leave\` if you want to opt out at any time.`
          });
        } else if (result.reason === 'already_member') {
          await respond({
            response_type: 'ephemeral',
            text: `:information_source: you're already a member of the Leader's Pings group. trying to leave? use \`/leaders-ping leave\` if you want to opt out! `
          });
        }
        break;
      }
      
      case 'leave':
      case 'quit': {
        const result = await removeUserFromGroup(client, userId);
        if (result.success) {
          await respond({
            response_type: 'ephemeral',
            text: `:wave: sorry you didn't like our pings... feel free to join us again anytime with \`/leaders-ping join\` though!`
          });
        } else if (result.reason === 'not_member') {
          await respond({
            response_type: 'ephemeral',
            text: `:information_source: you're not a member of the Leader's Pings group. use \`/leaders-ping join\` to opt in and join the fun!`
          });
        } else if (result.reason === 'last_member') {
          await respond({
            response_type: 'ephemeral',
            text: `:warning: an error has occured :( - you should dm @lynn to get this sorted out!`
          });
        }
        break;
      }
      
      case 'add': {
        if (!isAdmin(userId)) {
          await respond({
            response_type: 'ephemeral',
            text: `the racoons have determined you are not worth to hold such power... move along kid, nothing to see here.`
          });
          return;
        }
        
        const targetArg = args.slice(1).join(' ');
        const targetUserId = extractUserId(targetArg);
        
        if (!targetUserId) {
          await respond({
            response_type: 'ephemeral',
            text: `specify a user to add! usage: \`/leaders-ping add @user\` or \`/leaders-ping add U12345ABC\``
          });
          return;
        }
        
        const result = await addUserToGroup(client, targetUserId);
        if (result.success) {
          // DM the user to let them know they've been added
          try {
            const dmChannel = await client.conversations.open({ users: targetUserId });
            await client.chat.postMessage({
              channel: dmChannel.channel.id,
              text: `hey! you've been added to the Leader's Pings group by a Clubs team member. you'll now receive pings when we post announcements. use \`/leaders-ping leave\` if you want to opt out at any time!`
            });
          } catch (dmError) {
            console.error('Failed to DM user:', dmError);
          }
          
          await respond({
            response_type: 'ephemeral',
            text: `<@${targetUserId}> has been "kidnapped" into Leader's Pings! they've been dmed as well so they know what's up.`
          });
        } else if (result.reason === 'already_member') {
          await respond({
            response_type: 'ephemeral',
            text: `oop. <@${targetUserId}> seems to already a member of the Leader's Pings group. i don't think i can let you add them to something they're already in...`
          });
        }
        break;
      }
      
      case 'mass-add':
      case 'massadd':
      case 'bulk-add':
      case 'bulkadd': {
        if (!isAdmin(userId)) {
          await respond({
            response_type: 'ephemeral',
            text: `the racoons have determined you are not worth to hold such power... move along kid, nothing to see here.`
          });
          return;
        }
        
        const massAddArg = args.slice(1).join(' ');
        const targetUserIds = extractMultipleUserIds(massAddArg);
        
        if (targetUserIds.length === 0) {
          await respond({
            response_type: 'ephemeral',
            text: `no valid user IDs found! usage: \`/leaders-ping mass-add U12345ABC U67890DEF U11111AAA\`\nyou can also paste a list separated by spaces, commas, or newlines.`
          });
          return;
        }
        
        await respond({
          response_type: 'ephemeral',
          text: `:hourglass_flowing_sand: processing ${targetUserIds.length} user(s)... please wait!`
        });
        
        const results = await addMultipleUsersToGroup(client, targetUserIds);
        
        // DM all successfully added users
        for (const addedUserId of results.added) {
          try {
            const dmChannel = await client.conversations.open({ users: addedUserId });
            await client.chat.postMessage({
              channel: dmChannel.channel.id,
              text: `hey! you've been added to the Leader's Pings group as part of your leader status. you'll now receive pings when we post announcements regarding your club or ask for some feedback. use \`/leaders-ping leave\` if you want to opt out at any time (we won't get mad, we promise)!`
            });
          } catch (dmError) {
            console.error(`Failed to DM user ${addedUserId}:`, dmError);
          }
        }
        
        // Build response message
        const responseLines = [`:white_check_mark: *Mass-add complete!*`];
        
        if (results.added.length > 0) {
          responseLines.push(`\n*Added (${results.added.length}):* ${results.added.map(id => `<@${id}>`).join(', ')}`);
        }
        
        if (results.alreadyMembers.length > 0) {
          responseLines.push(`\n*Already members (${results.alreadyMembers.length}):* ${results.alreadyMembers.map(id => `<@${id}>`).join(', ')}`);
        }
        
        if (results.failed.length > 0) {
          responseLines.push(`\n*Failed (${results.failed.length}):* ${results.failed.map(id => `<@${id}>`).join(', ')}`);
        }
        
        await respond({
          response_type: 'ephemeral',
          text: responseLines.join('')
        });
        break;
      }
      
      case 'remove':
      case 'kick': {
        if (!isAdmin(userId)) {
          await respond({
            response_type: 'ephemeral',
            text: `the racoons have determined you are not worth to hold such power... move along kid, nothing to see here.`
          });
          return;
        }
        
        const targetArg = args.slice(1).join(' ');
        const targetUserId = extractUserId(targetArg);
        
        if (!targetUserId) {
          await respond({
            response_type: 'ephemeral',
            text: `i can't remove nothing! you have to specify a user to remove, silly! usage: \`/leaders-ping remove @user\` or \`/leaders-ping remove U12345ABC\``
          });
          return;
        }
        
        const result = await removeUserFromGroup(client, targetUserId);
        if (result.success) {
          // DM the user to let them know they've been removed
          try {
            const dmChannel = await client.conversations.open({ users: targetUserId });
            await client.chat.postMessage({
              channel: dmChannel.channel.id,
              text: `hey! you've been removed from the Leader's Pings group by a Clubs team member. you won't receive pings anymore, but feel free to join back anytime with \`/leaders-ping join\`!`
            });
          } catch (dmError) {
            console.error('Failed to DM user:', dmError);
          }
          
          await respond({
            response_type: 'ephemeral',
            text: `<@${targetUserId}> has been kicked out from the Leader's Pings group. they've been dmed as well so they know what's up... guess they weren't that into the pings anyway.`
          });
        } else if (result.reason === 'not_member') {
          await respond({
            response_type: 'ephemeral',
            text: `oop... <@${targetUserId}> is not a member of the Leader's Pings group. guess they don't want those sweet sweet pings after all!`
          });
        } else if (result.reason === 'last_member') {
          await respond({
            response_type: 'ephemeral',
            text: `:warning: can't remove - can you try DMing @lynn?`
          });
        }
        break;
      }
      
      case 'help':
      default: {
        const helpLines = [
          '*that\'s an invalid command... here\'s the available ones:*',
          '',
          '`/leaders-ping join` - Add yourself to @leaders-ping',
          '`/leaders-ping leave` - Remove yourself from @leaders-ping',
        ];
        
        if (isAdmin(userId)) {
          helpLines.push(
            '',
            '*Admin Commands:*',
            '`/leaders-ping add @user/U12345ABC` - Add someone else to the group',
            '`/leaders-ping remove @user` - Remove someone from the group',
            '`/leaders-ping mass-add U123 U456 U789` - Add multiple users at once via Slack IDs',
          );
        }
        
        const helpText = helpLines.join('\n');
        
        await respond({
          response_type: 'ephemeral',
          text: helpText
        });
        break;
      }
    }
  } catch (error) {
    console.error('Error handling /leaders-ping command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `:x: An error occurred: ${error.message}`
    });
  }
});

// Message listener: Detect when @leaders-ping is mentioned
app.message(async ({ message, client, say }) => {
  // Skip bot messages and message edits
  if (message.subtype || message.bot_id) return;
  
  // Check if the message mentions the @leaders-ping usergroup
  // Usergroup mentions look like <!subteam^S09M5G46ASW|@leaders-ping> or <!subteam^S09M5G46ASW>
  const usergroupMentionPattern = new RegExp(`<!subteam\\^${USERGROUP_ID}(?:\\|[^>]+)?>`);
  if (!usergroupMentionPattern.test(message.text)) return;
  
  const userId = message.user;
  const channelId = message.channel;
  const messageTs = message.ts;
  
  try {
    if (isAdmin(userId)) {
      // Admin ping: Send :thread: emoji to main channel (not in thread)
      const threadEmojiMessage = await client.chat.postMessage({
        channel: channelId,
        text: ':thread:',
      });
      
      // Build permalink to the :thread: message
      const permalinkResponse = await client.chat.getPermalink({
        channel: channelId,
        message_ts: threadEmojiMessage.ts,
      });
      const threadMessageLink = permalinkResponse.permalink;
      
      // Reply in the original message's thread with "Please thread here!" linking to the emoji message
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs,
        text: `Please thread <${threadMessageLink}|here>!`,
      });
    } else {
      // Non-admin ping: Reply in thread with warning
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs,
        text: `please do not ping leaders! this is exclusive for the clubs team to announce! - *DO NOT REPLY HERE PLEASE!*`,
      });
    }
  } catch (error) {
    console.error('Error handling @leaders-ping mention:', error);
  }
});

// Start the app
(async () => {
  await app.start();
  console.log('⚡️ Leaders Ping Bot is running!');
  console.log(`📋 Managing usergroup: ${USERGROUP_ID}`);
  console.log(`👮 Admins: ${ADMIN_IDS.length > 0 ? ADMIN_IDS.join(', ') : 'None configured'}`);
})();
