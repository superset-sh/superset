// src/tools.ts
var API = "https://slack.com/api";
async function slack(accessToken, method, params = {}, httpMethod = "POST") {
  const body = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null)
      body[key] = value;
  }
  const search = new URLSearchParams;
  for (const [key, value] of Object.entries(body)) {
    search.set(key, String(value));
  }
  const response = await fetch(httpMethod === "GET" ? `${API}/${method}?${search}` : `${API}/${method}`, {
    method: httpMethod === "GET" ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": httpMethod === "GET" ? "application/x-www-form-urlencoded" : "application/json; charset=utf-8"
    },
    ...httpMethod === "GET" ? {} : { body: JSON.stringify(body) }
  });
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(`Slack API error: ${payload.error ?? "Unknown error"}`);
  }
  return payload;
}
function text(value) {
  return { content: [{ type: "text", text: value }] };
}
function sender(message) {
  if (message.user)
    return `<@${message.user}>`;
  return message.username ?? message.bot_id ?? message.app_id ?? "Unknown";
}
function describeMessage(message) {
  let line = `[${message.ts}] ${sender(message)}: ${message.text ?? ""}`;
  if (message.reply_count && message.reply_count > 0) {
    line += ` \uD83D\uDCAC ${message.reply_count} ${message.reply_count === 1 ? "reply" : "replies"}`;
  } else if (message.thread_ts && message.thread_ts !== message.ts) {
    line += " ↪️ in thread";
  }
  return line;
}
function cursorNote(payload) {
  const cursor = payload.response_metadata?.next_cursor;
  return cursor ? `
\uD83D\uDCC4 More available. Use cursor: "${cursor}"` : "";
}
var CHANNEL = {
  type: "string",
  description: "Channel or DM ID, e.g. C0123ABC or D0123ABC."
};
var TS = {
  type: "string",
  description: "Message timestamp, e.g. 1788794757.390949."
};
var USER = { type: "string", description: "User ID, e.g. U0123ABC." };
function tool(name, description, properties, required, readOnly, destructive = false) {
  return {
    name,
    description,
    inputSchema: { type: "object", properties, required },
    annotations: { readOnlyHint: readOnly, destructiveHint: destructive }
  };
}
function getTools() {
  return [
    tool("send_message", "Sends a message to a Slack channel or DM", {
      channel: CHANNEL,
      text: { type: "string", description: "Message text content." },
      thread_ts: {
        type: "string",
        description: "Thread timestamp to reply in thread."
      }
    }, ["channel", "text"], false),
    tool("update_message", "Updates an existing message", {
      channel: CHANNEL,
      ts: TS,
      text: { type: "string", description: "New message text." }
    }, ["channel", "ts", "text"], false),
    tool("delete_message", "Deletes a message", {
      channel: CHANNEL,
      ts: TS
    }, ["channel", "ts"], false, true),
    tool("get_message", "Gets details of a specific message", {
      channel: CHANNEL,
      ts: TS
    }, ["channel", "ts"], true),
    tool("list_messages", "Lists messages from a channel or DM", {
      channel: CHANNEL,
      limit: {
        type: "number",
        description: "Maximum messages (default 50)."
      },
      cursor: { type: "string", description: "Pagination cursor." },
      oldest: {
        type: "string",
        description: "Only messages after this timestamp."
      },
      latest: {
        type: "string",
        description: "Only messages before this timestamp."
      }
    }, ["channel"], true),
    tool("search_messages", "Searches for messages across workspace", {
      query: {
        type: "string",
        description: "Slack search query, e.g. 'deploy in:#eng from:@alice'."
      },
      count: {
        type: "number",
        description: "Results per page (default 20)."
      },
      page: { type: "number", description: "Result page (default 1)." }
    }, ["query"], true),
    tool("get_unread", "Gets unread messages from a specific channel", {
      channel: CHANNEL,
      limit: {
        type: "number",
        description: "Maximum messages (default 50)."
      }
    }, ["channel"], true),
    tool("get_thread_replies", "Gets all replies in a thread", {
      channel: CHANNEL,
      thread_ts: { type: "string", description: "Parent message timestamp." },
      limit: {
        type: "number",
        description: "Maximum replies (default 100)."
      }
    }, ["channel", "thread_ts"], true),
    tool("add_reaction", "Adds a reaction emoji to a message", {
      channel: CHANNEL,
      ts: TS,
      name: {
        type: "string",
        description: "Emoji name without colons, e.g. white_check_mark."
      }
    }, ["channel", "ts", "name"], false),
    tool("remove_reaction", "Removes a reaction from a message", {
      channel: CHANNEL,
      ts: TS,
      name: { type: "string", description: "Emoji name without colons." }
    }, ["channel", "ts", "name"], false),
    tool("get_reactions", "Gets all reactions on a message", {
      channel: CHANNEL,
      ts: TS
    }, ["channel", "ts"], true),
    tool("list_channels", "Lists all channels in workspace", {
      types: {
        type: "string",
        description: "Comma-separated: public_channel, private_channel, im, mpim."
      },
      name: {
        type: "string",
        description: "Filter channels whose name contains this text."
      },
      exclude_archived: {
        type: "boolean",
        description: "Skip archived channels (default true)."
      },
      limit: {
        type: "number",
        description: "Maximum channels (default 100)."
      },
      cursor: { type: "string", description: "Pagination cursor." }
    }, [], true),
    tool("get_channel", "Gets details of a specific channel", {
      channel: CHANNEL
    }, ["channel"], true),
    tool("create_channel", "Creates a new channel", {
      name: {
        type: "string",
        description: "Channel name, lowercase, no spaces."
      },
      is_private: {
        type: "boolean",
        description: "Create as a private channel."
      }
    }, ["name"], false),
    tool("archive_channel", "Archives a channel", { channel: CHANNEL }, ["channel"], false, true),
    tool("unarchive_channel", "Unarchives a channel", { channel: CHANNEL }, ["channel"], false),
    tool("invite_to_channel", "Invites users to a channel", {
      channel: CHANNEL,
      users: { type: "string", description: "Comma-separated user IDs." }
    }, ["channel", "users"], false),
    tool("kick_from_channel", "Removes a user from a channel", {
      channel: CHANNEL,
      user: USER
    }, ["channel", "user"], false, true),
    tool("join_channel", "Joins a channel", { channel: CHANNEL }, ["channel"], false),
    tool("leave_channel", "Leaves a channel", { channel: CHANNEL }, ["channel"], false),
    tool("rename_channel", "Renames a channel", {
      channel: CHANNEL,
      name: { type: "string", description: "New channel name." }
    }, ["channel", "name"], false),
    tool("set_channel_topic", "Sets channel topic", {
      channel: CHANNEL,
      topic: { type: "string", description: "New topic text." }
    }, ["channel", "topic"], false),
    tool("set_channel_purpose", "Sets channel purpose", {
      channel: CHANNEL,
      purpose: { type: "string", description: "New purpose text." }
    }, ["channel", "purpose"], false),
    tool("list_users", "Lists all users in workspace", {
      limit: { type: "number", description: "Maximum users (default 100)." },
      cursor: { type: "string", description: "Pagination cursor." }
    }, [], true),
    tool("get_user", "Gets details of a specific user", { user: USER }, ["user"], true),
    tool("get_user_by_email", "Finds a user by email address", {
      email: { type: "string", description: "Email address to look up." }
    }, ["email"], true),
    tool("get_user_presence", "Gets user presence status", { user: USER }, ["user"], true),
    tool("set_user_presence", "Sets your presence status", {
      presence: { type: "string", description: "Either 'auto' or 'away'." }
    }, ["presence"], false),
    tool("get_team_info", "Gets workspace/team information", {}, [], true)
  ];
}
async function callTool(name, args, accessToken) {
  if (!accessToken) {
    return {
      ...text("Not connected; connect the plugin first."),
      isError: true
    };
  }
  try {
    switch (name) {
      case "send_message": {
        const data = await slack(accessToken, "chat.postMessage", {
          channel: args.channel,
          text: args.text,
          thread_ts: args.thread_ts
        });
        return text(`✓ Message sent to <#${args.channel}>
Timestamp: ${data.ts}
Channel: ${data.channel}`);
      }
      case "update_message": {
        const data = await slack(accessToken, "chat.update", {
          channel: args.channel,
          ts: args.ts,
          text: args.text
        });
        return text(`✓ Message updated
Timestamp: ${data.ts}
Channel: ${data.channel}`);
      }
      case "delete_message": {
        await slack(accessToken, "chat.delete", {
          channel: args.channel,
          ts: args.ts
        });
        return text(`✓ Message deleted from <#${args.channel}>`);
      }
      case "get_message": {
        const data = await slack(accessToken, "conversations.history", {
          channel: args.channel,
          latest: args.ts,
          oldest: args.ts,
          inclusive: true,
          limit: 1
        }, "GET");
        const message = data.messages?.[0];
        if (!message)
          return text("Message not found");
        let out = describeMessage(message);
        if (message.reactions?.length) {
          out += `
Reactions: ${message.reactions.map((r) => `:${r.name}: ${r.count}`).join(", ")}`;
        }
        return text(out);
      }
      case "list_messages": {
        const data = await slack(accessToken, "conversations.history", {
          channel: args.channel,
          limit: args.limit ?? 50,
          cursor: args.cursor,
          oldest: args.oldest,
          latest: args.latest
        }, "GET");
        const messages = data.messages ?? [];
        if (!messages.length)
          return text("No messages found");
        const lines = [
          `Found ${messages.length} message(s) in <#${args.channel}>:`,
          ""
        ];
        for (const message of messages)
          lines.push(describeMessage(message));
        return text(lines.join(`
`) + cursorNote(data));
      }
      case "search_messages": {
        const data = await slack(accessToken, "search.messages", {
          query: args.query,
          count: args.count ?? 20,
          page: args.page ?? 1
        }, "GET");
        const matches = data.messages?.matches ?? [];
        if (!matches.length)
          return text("No messages found");
        const lines = [
          `Found ${matches.length} match(es) for "${args.query}":`,
          ""
        ];
        for (const match of matches) {
          const channel = typeof match.channel === "object" ? match.channel?.name ?? match.channel?.id : match.channel;
          lines.push(`[${match.ts}] #${channel} ${sender(match)}: ${match.text ?? ""}`);
          if (match.permalink)
            lines.push(`  ${match.permalink}`);
        }
        return text(lines.join(`
`));
      }
      case "get_unread": {
        const info = await slack(accessToken, "conversations.info", { channel: args.channel }, "GET");
        const lastRead = info.channel?.last_read;
        const data = await slack(accessToken, "conversations.history", {
          channel: args.channel,
          limit: args.limit ?? 50,
          ...lastRead ? { oldest: lastRead } : {}
        }, "GET");
        const messages = (data.messages ?? []).filter((m) => m.ts !== lastRead);
        if (!messages.length)
          return text("No unread messages found");
        const lines = [
          `Found ${messages.length} unread message(s) in <#${args.channel}>:`,
          ""
        ];
        for (const message of messages.slice(0, 20)) {
          const body = message.text ?? "";
          lines.push(`[${message.ts}] ${sender(message)}: ${body.slice(0, 100)}${body.length > 100 ? "..." : ""}`);
        }
        return text(lines.join(`
`));
      }
      case "get_thread_replies": {
        const data = await slack(accessToken, "conversations.replies", {
          channel: args.channel,
          ts: args.thread_ts,
          limit: args.limit ?? 100
        }, "GET");
        const messages = data.messages ?? [];
        if (!messages.length)
          return text("No replies found");
        const lines = [
          `Thread in <#${args.channel}> — ${messages.length} message(s):`,
          ""
        ];
        for (const message of messages)
          lines.push(describeMessage(message));
        return text(lines.join(`
`) + cursorNote(data));
      }
      case "add_reaction": {
        await slack(accessToken, "reactions.add", {
          channel: args.channel,
          timestamp: args.ts,
          name: args.name
        });
        return text(`✓ Added :${args.name}: to message ${args.ts}`);
      }
      case "remove_reaction": {
        await slack(accessToken, "reactions.remove", {
          channel: args.channel,
          timestamp: args.ts,
          name: args.name
        });
        return text(`✓ Removed :${args.name}: from message ${args.ts}`);
      }
      case "get_reactions": {
        const data = await slack(accessToken, "reactions.get", {
          channel: args.channel,
          timestamp: args.ts
        }, "GET");
        const reactions = data.message?.reactions ?? [];
        if (!reactions.length)
          return text("No reactions on this message");
        const lines = [`Reactions on ${args.ts}:`, ""];
        for (const reaction of reactions) {
          lines.push(`:${reaction.name}: ${reaction.count} — ${(reaction.users ?? []).map((u) => `<@${u}>`).join(", ")}`);
        }
        return text(lines.join(`
`));
      }
      case "list_channels": {
        const data = await slack(accessToken, "conversations.list", {
          types: args.types ?? "public_channel,private_channel",
          exclude_archived: args.exclude_archived ?? true,
          limit: args.limit ?? 100,
          cursor: args.cursor
        }, "GET");
        let channels = data.channels ?? [];
        const filter = args.name?.toLowerCase();
        if (filter)
          channels = channels.filter((c) => c.name?.toLowerCase().includes(filter));
        if (!channels.length) {
          return text(filter ? "No channels found matching the name filter" : "No channels found");
        }
        const lines = [
          `Found ${channels.length} channel(s)${filter ? ` matching "${args.name}"` : ""}:`,
          ""
        ];
        for (const channel of channels) {
          let line = `<#${channel.id}> - ${channel.name ?? (channel.is_im ? `DM with <@${channel.user}>` : channel.id)}`;
          if (channel.is_private)
            line += " \uD83D\uDD12";
          if (channel.is_archived)
            line += " [archived]";
          if (channel.num_members !== undefined)
            line += ` (${channel.num_members} members)`;
          lines.push(line);
        }
        return text(lines.join(`
`) + cursorNote(data));
      }
      case "get_channel": {
        const data = await slack(accessToken, "conversations.info", { channel: args.channel }, "GET");
        const channel = data.channel;
        let out = `Channel: <#${channel.id}> - ${channel.name ?? channel.id}
`;
        out += `ID: ${channel.id}
`;
        out += `Private: ${channel.is_private ? "yes" : "no"}
`;
        out += `Archived: ${channel.is_archived ? "yes" : "no"}
`;
        if (channel.num_members !== undefined)
          out += `Members: ${channel.num_members}
`;
        if (channel.topic?.value)
          out += `Topic: ${channel.topic.value}
`;
        if (channel.purpose?.value)
          out += `Purpose: ${channel.purpose.value}
`;
        return text(out);
      }
      case "create_channel": {
        const data = await slack(accessToken, "conversations.create", {
          name: args.name,
          is_private: args.is_private ?? false
        });
        const channel = data.channel;
        return text(`✓ Created <#${channel.id}> - ${channel.name}`);
      }
      case "archive_channel":
        await slack(accessToken, "conversations.archive", {
          channel: args.channel
        });
        return text(`✓ Archived <#${args.channel}>`);
      case "unarchive_channel":
        await slack(accessToken, "conversations.unarchive", {
          channel: args.channel
        });
        return text(`✓ Unarchived <#${args.channel}>`);
      case "invite_to_channel":
        await slack(accessToken, "conversations.invite", {
          channel: args.channel,
          users: args.users
        });
        return text(`✓ Invited ${args.users} to <#${args.channel}>`);
      case "kick_from_channel":
        await slack(accessToken, "conversations.kick", {
          channel: args.channel,
          user: args.user
        });
        return text(`✓ Removed <@${args.user}> from <#${args.channel}>`);
      case "join_channel":
        await slack(accessToken, "conversations.join", {
          channel: args.channel
        });
        return text(`✓ Joined <#${args.channel}>`);
      case "leave_channel":
        await slack(accessToken, "conversations.leave", {
          channel: args.channel
        });
        return text(`✓ Left <#${args.channel}>`);
      case "rename_channel": {
        const data = await slack(accessToken, "conversations.rename", {
          channel: args.channel,
          name: args.name
        });
        return text(`✓ Renamed to ${data.channel?.name}`);
      }
      case "set_channel_topic":
        await slack(accessToken, "conversations.setTopic", {
          channel: args.channel,
          topic: args.topic
        });
        return text(`✓ Topic set on <#${args.channel}>`);
      case "set_channel_purpose":
        await slack(accessToken, "conversations.setPurpose", {
          channel: args.channel,
          purpose: args.purpose
        });
        return text(`✓ Purpose set on <#${args.channel}>`);
      case "list_users": {
        const data = await slack(accessToken, "users.list", {
          limit: args.limit ?? 100,
          cursor: args.cursor
        }, "GET");
        const members = (data.members ?? []).filter((m) => !m.deleted);
        if (!members.length)
          return text("No users found");
        const lines = [`Found ${members.length} user(s):`, ""];
        for (const member of members) {
          let line = `<@${member.id}> - ${member.real_name ?? member.name}`;
          if (member.is_bot)
            line += " \uD83E\uDD16";
          if (member.is_admin)
            line += " [admin]";
          if (member.profile?.title)
            line += ` — ${member.profile.title}`;
          lines.push(line);
        }
        return text(lines.join(`
`) + cursorNote(data));
      }
      case "get_user": {
        const data = await slack(accessToken, "users.info", { user: args.user }, "GET");
        const user = data.user;
        let out = `User: <@${user.id}> - ${user.real_name ?? user.name}
`;
        out += `ID: ${user.id}
Handle: ${user.name}
`;
        if (user.profile?.title)
          out += `Title: ${user.profile.title}
`;
        if (user.profile?.email)
          out += `Email: ${user.profile.email}
`;
        if (user.tz)
          out += `Timezone: ${user.tz}
`;
        out += `Bot: ${user.is_bot ? "yes" : "no"}
`;
        return text(out);
      }
      case "get_user_by_email": {
        const data = await slack(accessToken, "users.lookupByEmail", { email: args.email }, "GET");
        const user = data.user;
        return text(`<@${user.id}> - ${user.real_name ?? user.name}
ID: ${user.id}
Handle: ${user.name}`);
      }
      case "get_user_presence": {
        const data = await slack(accessToken, "users.getPresence", { user: args.user }, "GET");
        return text(`<@${args.user}> is ${data.presence}`);
      }
      case "set_user_presence":
        await slack(accessToken, "users.setPresence", {
          presence: args.presence
        });
        return text(`✓ Presence set to ${args.presence}`);
      case "get_team_info": {
        const data = await slack(accessToken, "team.info", {}, "GET");
        const team = data.team;
        let out = `Workspace: ${team.name}
`;
        out += `Domain: ${team.domain}.slack.com
`;
        out += `ID: ${team.id}
`;
        if (team.email_domain)
          out += `Email Domain: ${team.email_domain}
`;
        return text(out);
      }
      default:
        return { ...text(`Unknown tool: ${name}`), isError: true };
    }
  } catch (error) {
    return {
      ...text(`Error: ${error instanceof Error ? error.message : String(error)}`),
      isError: true
    };
  }
}

// src/types.ts
var PluginEventType = {
  SYNC: "sync",
  GET_TOOLS: "get-tools",
  CALL_TOOL: "call-tool"
};

// src/index.ts
async function run(event) {
  switch (event.event) {
    case PluginEventType.GET_TOOLS:
      return getTools();
    case PluginEventType.CALL_TOOL:
      return await callTool(event.eventBody.name, event.eventBody.arguments ?? {}, event.config?.access_token);
    default:
      return { message: `Unhandled event: ${event.event}` };
  }
}
export {
  run
};
