# Leaders Ping Bot

A Slack bot that lets users manage their membership in the `@leaders-ping` user group.

## Features

- **Join**: Users can add themselves to @leaders-ping
- **Leave**: Users can remove themselves from @leaders-ping
- **Admin Add**: Designated admins can add others via mention or Slack ID
- **Admin Remove**: Admins can remove others from the group

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name it (e.g., "Leaders Ping Bot") and select your workspace

### 2. Configure Bot Permissions

Go to **OAuth & Permissions** and add these **Bot Token Scopes**:

- `commands` - For slash commands
- `usergroups:read` - Read user group membership
- `usergroups:write` - Modify user group membership

### 3. Enable Socket Mode

1. Go to **Socket Mode** in the sidebar
2. Enable Socket Mode
3. Create an App-Level Token with `connections:write` scope
4. Save the token (starts with `xapp-`)

### 4. Create the Slash Command

1. Go to **Slash Commands**
2. Click **Create New Command**
3. Configure:
   - Command: `/leaders`
   - Description: `Manage @leaders-ping membership`
   - Usage Hint: `[join|leave|add @user|remove @user|help]`

### 5. Install the App

1. Go to **Install App**
2. Click **Install to Workspace**
3. Authorize the permissions
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### 6. Get Your Signing Secret

1. Go to **Basic Information**
2. Under **App Credentials**, copy the **Signing Secret**

### 7. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token
```

### 9. Add Admins

Edit the `ADMIN_IDS` array in `app.js` to add users who can add/remove others:

```js
const ADMIN_IDS = [
  'U12345ABC', // @yourname
  'U67890DEF', // @anotherperson
];
```

Submit a PR to add yourself as an admin!

### 10. Install Dependencies & Run

```bash
npm install
npm start
```

## Usage

| Command | Description |
|---------|-------------|
| `/leaders join` | Add yourself to @leaders-ping |
| `/leaders leave` | Remove yourself from @leaders-ping |
| `/leaders help` | Show all commands |
| `/leaders add @user` | (Admin) Add someone by mention |
| `/leaders add U12345ABC` | (Admin) Add someone by Slack ID |
| `/leaders remove @user` | (Admin) Remove someone |

## Finding Slack User IDs

To find a user's Slack ID:
1. Click on their profile in Slack
2. Click the **⋮** menu
3. Select **Copy member ID**

## Configuration

The bot manages the user group with ID `S09M5G46ASW` (@leaders-ping). To change this, edit `USERGROUP_ID` in `app.js`.

## Running in Production

For production, consider using a process manager like PM2:

```bash
npm install -g pm2
pm2 start app.js --name leaders-ping-bot
pm2 save
```
