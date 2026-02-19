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

// Start the app
(async () => {
  await app.start();
  console.log('⚡️ Leaders Ping Bot is running!');
  console.log(`📋 Managing usergroup: ${USERGROUP_ID}`);
  console.log(`👮 Admins: ${ADMIN_IDS.length > 0 ? ADMIN_IDS.join(', ') : 'None configured'}`);
})();
