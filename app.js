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
app.command('/leaders', async ({ command, ack, respond, client }) => {
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
            text: `:white_check_mark: You've been added to the Leader's Pings group! You'll now receive pings when the Clubs team posts cool announcements. Use \`/leaders leave\` if you want to opt out at any time.`
          });
        } else if (result.reason === 'already_member') {
          await respond({
            response_type: 'ephemeral',
            text: `:information_source: You're already a member of the Leader's Pings group. Use \`/leaders leave\` if you want to opt out! `
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
            text: `:wave: You've opted out of Leader's Pings! Feel free to join us again anytime with \`/leaders join\`.`
          });
        } else if (result.reason === 'not_member') {
          await respond({
            response_type: 'ephemeral',
            text: `:information_source: You're not a member of the Leader's Pings group. Use \`/leaders join\` to opt in!`
          });
        } else if (result.reason === 'last_member') {
          await respond({
            response_type: 'ephemeral',
            text: `:warning: An error has occured :( - you should dm @lynn!`
          });
        }
        break;
      }
      
      case 'add': {
        if (!isAdmin(userId)) {
          await respond({
            response_type: 'ephemeral',
            text: `:x: The racoons have determined you are not worth to hold such power... Move along kid, nothing to see here.`
          });
          return;
        }
        
        const targetArg = args.slice(1).join(' ');
        const targetUserId = extractUserId(targetArg);
        
        if (!targetUserId) {
          await respond({
            response_type: 'ephemeral',
            text: `:x: Please specify a user to add. Usage: \`/leaders add @user\` or \`/leaders add U12345ABC\``
          });
          return;
        }
        
        const result = await addUserToGroup(client, targetUserId);
        if (result.success) {
          await respond({
            response_type: 'ephemeral',
            text: `:white_check_mark: <@${targetUserId}> has been opted into Leader's Pings!`
          });
        } else if (result.reason === 'already_member') {
          await respond({
            response_type: 'ephemeral',
            text: `:information_source: <@${targetUserId}> is already a member of the Leader's Pings group.`
          });
        }
        break;
      }
      
      case 'remove':
      case 'kick': {
        if (!isAdmin(userId)) {
          await respond({
            response_type: 'ephemeral',
            text: `:x: The racoons have determined you are not worth to hold such power... Move along kid, nothing to see here.`
          });
          return;
        }
        
        const targetArg = args.slice(1).join(' ');
        const targetUserId = extractUserId(targetArg);
        
        if (!targetUserId) {
          await respond({
            response_type: 'ephemeral',
            text: `:x: Please specify a user to remove. Usage: \`/leaders remove @user\` or \`/leaders remove U12345ABC\``
          });
          return;
        }
        
        const result = await removeUserFromGroup(client, targetUserId);
        if (result.success) {
          await respond({
            response_type: 'ephemeral',
            text: `:white_check_mark: <@${targetUserId}> has been removed from the Leader's Pings group.`
          });
        } else if (result.reason === 'not_member') {
          await respond({
            response_type: 'ephemeral',
            text: `:information_source: <@${targetUserId}> is not a member of the Leader's Pings group.`
          });
        } else if (result.reason === 'last_member') {
          await respond({
            response_type: 'ephemeral',
            text: `:warning: Cannot remove - can you try DMing @lynn?`
          });
        }
        break;
      }
      
      case 'help':
      default: {
        const helpLines = [
          '*that\'s an invalid command... here\'s the available ones:*',
          '',
          '`/leaders join` - Add yourself to @leaders-ping',
          '`/leaders leave` - Remove yourself from @leaders-ping',
        ];
        
        if (isAdmin(userId)) {
          helpLines.push(
            '',
            '*Admin Commands:*',
            '`/leaders add @user/U12345ABC` - Add someone else to the group',
            '`/leaders remove @user` - Remove someone from the group',
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
    console.error('Error handling /leaders command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `:x: An error occurred: ${error.message}`
    });
  }
});

// Start the app
(async () => {
  await app.start();
  console.log('⚡️ Leaders Ping Bot is running!');
  console.log(`📋 Managing usergroup: ${USERGROUP_ID}`);
  console.log(`👮 Admins: ${ADMIN_IDS.length > 0 ? ADMIN_IDS.join(', ') : 'None configured'}`);
})();
