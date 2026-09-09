// src/api.ts
var BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
async function gmail(accessToken, path, request = {}) {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value === undefined || value === null || value === "")
      continue;
    if (Array.isArray(value)) {
      for (const item of value)
        url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url, {
    method: request.method ?? "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...request.body === undefined ? {} : { "content-type": "application/json" }
    },
    ...request.body === undefined ? {} : { body: JSON.stringify(request.body) }
  });
  if (response.status === 204)
    return {};
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.error?.message ?? `${response.status} ${response.statusText}`;
    throw new Error(`Gmail API error: ${detail}`);
  }
  return payload ?? {};
}
function text(value) {
  return { content: [{ type: "text", text: value }] };
}
function failure(value) {
  return { ...text(value), isError: true };
}
function stringList(value, field) {
  if (value === undefined || value === null)
    return [];
  if (typeof value === "string")
    return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be a string or an array of strings`);
  }
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}
function requireString(args, field) {
  const value = args[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}
function optionalNumber(args, field) {
  const value = args[field];
  if (value === undefined || value === null)
    return;
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new Error(`${field} must be a number`);
  return parsed;
}
var MAX_CONCURRENT_REQUESTS = 5;
async function mapLimited(items, fn, limit = MAX_CONCURRENT_REQUESTS) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// src/mime.ts
var ASCII = /^[\x20-\x7e]*$/;
function headerSafe(value, field) {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${field} may not contain a carriage return or line feed`);
  }
  return value;
}
function quoted(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
function base64(bytes) {
  let binary = "";
  for (const byte of bytes)
    binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64Utf8(value) {
  return base64(new TextEncoder().encode(value));
}
function base64Url(value) {
  return base64Utf8(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function encodeHeader(value) {
  return ASCII.test(value) ? value : `=?UTF-8?B?${base64Utf8(value)}?=`;
}
function encodeAddress(value) {
  const match = value.match(/^\s*(.+?)\s*<([^>]+)>\s*$/);
  if (!match)
    return value.trim();
  return `${encodeHeader(match[1])} <${match[2].trim()}>`;
}
function wrap(value) {
  return (value.match(/.{1,76}/g) ?? []).join(`\r
`);
}
function boundary() {
  return `=_superset_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
}
function part(contentType, content, extra = []) {
  return [
    `Content-Type: ${contentType}`,
    "Content-Transfer-Encoding: base64",
    ...extra,
    "",
    wrap(base64Utf8(content))
  ].join(`\r
`);
}
function attachmentPart(attachment) {
  const name = quoted(encodeHeader(attachment.filename));
  const mimeType = headerSafe(attachment.mimeType ?? "application/octet-stream", "attachment mimeType");
  return [
    `Content-Type: ${mimeType}; name="${name}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${name}"`,
    "",
    wrap(attachment.content.replace(/\s+/g, ""))
  ].join(`\r
`);
}
function multipart(subtype, parts) {
  const mark = boundary();
  const body = parts.map((entry) => `--${mark}\r
${entry}`).concat(`--${mark}--`).join(`\r
`);
  return `${subtype}; boundary="${mark}"\r
\r
${body}`;
}
function readEmailFields(args) {
  const attachments = Array.isArray(args.attachments) ? args.attachments.map((entry) => {
    const filename = String(entry.filename ?? "").trim();
    const content = String(entry.content ?? "").trim();
    if (!filename || !content) {
      throw new Error("each attachment needs a filename and content");
    }
    return {
      filename: headerSafe(filename, "attachment filename"),
      content,
      ...entry.mimeType ? {
        mimeType: headerSafe(String(entry.mimeType), "attachment mimeType")
      } : {}
    };
  }) : [];
  const recipients = (value, field) => stringList(value, field).map((entry) => headerSafe(entry, field));
  return {
    to: recipients(args.to, "to"),
    cc: recipients(args.cc, "cc"),
    bcc: recipients(args.bcc, "bcc"),
    subject: headerSafe(String(args.subject ?? ""), "subject"),
    body: String(args.body ?? ""),
    ...args.htmlBody ? { htmlBody: String(args.htmlBody) } : {},
    attachments,
    ...args.inReplyTo ? { inReplyTo: headerSafe(String(args.inReplyTo), "inReplyTo") } : {},
    ...args.references ? { references: headerSafe(String(args.references), "references") } : {},
    ...args.threadId ? { threadId: String(args.threadId) } : {}
  };
}
function buildMime(fields) {
  if (!fields.to.length && !fields.cc.length && !fields.bcc.length) {
    throw new Error("at least one recipient is required in to, cc, or bcc");
  }
  const headers = ["MIME-Version: 1.0"];
  if (fields.to.length)
    headers.push(`To: ${fields.to.map(encodeAddress).join(", ")}`);
  if (fields.cc.length)
    headers.push(`Cc: ${fields.cc.map(encodeAddress).join(", ")}`);
  if (fields.bcc.length)
    headers.push(`Bcc: ${fields.bcc.map(encodeAddress).join(", ")}`);
  headers.push(`Subject: ${encodeHeader(fields.subject)}`);
  if (fields.inReplyTo) {
    headers.push(`In-Reply-To: ${fields.inReplyTo}`);
    headers.push(`References: ${fields.references ?? fields.inReplyTo}`);
  }
  const plain = part('text/plain; charset="UTF-8"', fields.body);
  const alternative = fields.htmlBody ? multipart("multipart/alternative", [
    plain,
    part('text/html; charset="UTF-8"', fields.htmlBody)
  ]) : null;
  if (fields.attachments.length) {
    const lead = alternative ? `Content-Type: ${alternative}` : plain;
    return `${headers.join(`\r
`)}\r
Content-Type: ${multipart("multipart/mixed", [lead, ...fields.attachments.map(attachmentPart)])}`;
  }
  if (alternative) {
    return `${headers.join(`\r
`)}\r
Content-Type: ${alternative}`;
  }
  return `${headers.join(`\r
`)}\r
${plain}`;
}
function encodeRaw(fields) {
  return base64Url(buildMime(fields));
}
function decodeBody(data) {
  if (!data)
    return "";
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0;index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}
function normalizeText(value) {
  return value.replace(/\r\n/g, `
`).replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, `

`).trim();
}
function htmlToText(html) {
  return normalizeText(html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<br\s*\/?>/gi, `
`).replace(/<li[^>]*>/gi, `
- `).replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, `
`).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
}
function header(part2, name) {
  const match = part2?.headers?.find((entry) => entry.name?.toLowerCase() === name.toLowerCase());
  return match?.value ?? "";
}
function walk(part2, found) {
  if (!part2)
    return;
  if (part2.body?.attachmentId && part2.filename) {
    found.attachments.push({
      filename: part2.filename,
      mimeType: part2.mimeType ?? "application/octet-stream",
      size: part2.body.size ?? 0,
      attachmentId: part2.body.attachmentId
    });
  } else if (part2.mimeType === "text/plain" && part2.body?.data) {
    found.plain.push(decodeBody(part2.body.data));
  } else if (part2.mimeType === "text/html" && part2.body?.data) {
    found.html.push(decodeBody(part2.body.data));
  }
  for (const child of part2.parts ?? [])
    walk(child, found);
}
function parseMessage(message) {
  const found = {
    plain: [],
    html: [],
    attachments: []
  };
  walk(message.payload, found);
  const body = found.plain.length ? normalizeText(found.plain.join(`
`)) : found.html.length ? htmlToText(found.html.join(`
`)) : message.snippet ?? "";
  return {
    id: message.id ?? "",
    threadId: message.threadId ?? "",
    from: header(message.payload, "from"),
    to: header(message.payload, "to"),
    cc: header(message.payload, "cc"),
    subject: header(message.payload, "subject"),
    date: header(message.payload, "date"),
    messageId: header(message.payload, "message-id"),
    labelIds: message.labelIds ?? [],
    body,
    attachments: found.attachments
  };
}
function renderMessage(parsed) {
  const lines = [
    `Subject: ${parsed.subject}`,
    `From: ${parsed.from}`,
    `To: ${parsed.to}`
  ];
  if (parsed.cc)
    lines.push(`Cc: ${parsed.cc}`);
  lines.push(`Date: ${parsed.date}`);
  lines.push(`Message ID: ${parsed.id}   Thread ID: ${parsed.threadId}`);
  if (parsed.labelIds.length)
    lines.push(`Labels: ${parsed.labelIds.join(", ")}`);
  if (parsed.attachments.length) {
    lines.push(`Attachments: ${parsed.attachments.map((entry) => `${entry.filename} (${entry.mimeType}, ${entry.size} bytes, id ${entry.attachmentId})`).join("; ")}`);
  }
  lines.push("", parsed.body);
  return lines.join(`
`);
}

// src/handlers/drafts.ts
function draftBody(args) {
  const fields = readEmailFields(args);
  return {
    message: {
      raw: encodeRaw(fields),
      ...fields.threadId ? { threadId: fields.threadId } : {}
    }
  };
}
var draftHandlers = {
  draft_email: async (args, accessToken) => {
    const draft = await gmail(accessToken, "/drafts", {
      method: "POST",
      body: draftBody(args)
    });
    return text(`✓ Created draft ${draft.id}
Message ID: ${draft.message?.id}
Thread ID: ${draft.message?.threadId}`);
  },
  list_drafts: async (args, accessToken) => {
    const data = await gmail(accessToken, "/drafts", {
      query: {
        maxResults: Math.min(optionalNumber(args, "maxResults") ?? 20, 100),
        q: args.query
      }
    });
    const drafts = data.drafts ?? [];
    if (!drafts.length)
      return text("No drafts found");
    const details = await mapLimited(drafts, (draft) => gmail(accessToken, `/drafts/${draft.id}`, {
      query: { format: "metadata" }
    }).catch(() => null));
    const lines = [`Found ${drafts.length} draft(s):`, ""];
    details.forEach((draft, index) => {
      const id = drafts[index]?.id ?? "";
      if (!draft?.message) {
        lines.push(`[${id}] (could not be read)`);
        return;
      }
      const parsed = parseMessage(draft.message);
      lines.push(`[${id}] To: ${parsed.to || "(no recipient)"}
  ${parsed.subject || "(no subject)"}`);
    });
    if (data.nextPageToken) {
      lines.push("", `\uD83D\uDCC4 More available. pageToken: "${data.nextPageToken}"`);
    }
    return text(lines.join(`
`));
  },
  get_draft: async (args, accessToken) => {
    const draftId = requireString(args, "draftId");
    const draft = await gmail(accessToken, `/drafts/${draftId}`, {
      query: { format: "full" }
    });
    if (!draft.message)
      throw new Error(`draft ${draftId} has no message`);
    return text(`Draft ID: ${draftId}
${renderMessage(parseMessage(draft.message))}`);
  },
  update_draft: async (args, accessToken) => {
    const draftId = requireString(args, "draftId");
    const draft = await gmail(accessToken, `/drafts/${draftId}`, {
      method: "PUT",
      body: draftBody(args)
    });
    return text(`✓ Updated draft ${draft.id ?? draftId}`);
  },
  delete_draft: async (args, accessToken) => {
    const draftId = requireString(args, "draftId");
    await gmail(accessToken, `/drafts/${draftId}`, { method: "DELETE" });
    return text(`✓ Deleted draft ${draftId}`);
  },
  send_draft: async (args, accessToken) => {
    const draftId = requireString(args, "draftId");
    const sent = await gmail(accessToken, "/drafts/send", { method: "POST", body: { id: draftId } });
    return text(`✓ Sent draft ${draftId}
Message ID: ${sent.id}
Thread ID: ${sent.threadId}`);
  }
};

// src/handlers/filters.ts
function describe(filter) {
  const criteria = Object.entries(filter.criteria ?? {}).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(", ");
  const action = Object.entries(filter.action ?? {}).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(", ");
  return `[${filter.id}]
  when: ${criteria || "(none)"}
  then: ${action || "(none)"}`;
}
function labels(parameters) {
  return stringList(parameters.labelIds, "parameters.labelIds");
}
function required(parameters, field) {
  const value = parameters[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`parameters.${field} is required for this template`);
  }
  return value.trim();
}
var TEMPLATES = {
  fromSender: (parameters) => ({
    criteria: { from: required(parameters, "senderEmail") },
    action: {
      addLabelIds: labels(parameters),
      ...parameters.archive ? { removeLabelIds: ["INBOX"] } : {}
    }
  }),
  withSubject: (parameters) => ({
    criteria: { subject: required(parameters, "subjectText") },
    action: {
      addLabelIds: labels(parameters),
      ...parameters.markAsRead ? { removeLabelIds: ["UNREAD"] } : {}
    }
  }),
  withAttachments: (parameters) => ({
    criteria: { hasAttachment: true },
    action: { addLabelIds: labels(parameters) }
  }),
  largeEmails: (parameters) => {
    const size = Number(parameters.sizeInBytes);
    if (!Number.isFinite(size)) {
      throw new Error("parameters.sizeInBytes is required for this template");
    }
    return {
      criteria: { size, sizeComparison: "larger" },
      action: { addLabelIds: labels(parameters) }
    };
  },
  containingText: (parameters) => ({
    criteria: { query: `"${required(parameters, "searchText")}"` },
    action: {
      addLabelIds: parameters.markImportant ? [...labels(parameters), "IMPORTANT"] : labels(parameters)
    }
  }),
  mailingList: (parameters) => {
    const list = required(parameters, "listIdentifier");
    return {
      criteria: { query: `list:${list} OR subject:[${list}]` },
      action: {
        addLabelIds: labels(parameters),
        ...parameters.archive === false ? {} : { removeLabelIds: ["INBOX"] }
      }
    };
  }
};
async function create(accessToken, body) {
  const filter = await gmail(accessToken, "/settings/filters", {
    method: "POST",
    body
  });
  return text(`✓ Created filter
${describe(filter)}`);
}
var filterHandlers = {
  list_filters: async (_args, accessToken) => {
    const data = await gmail(accessToken, "/settings/filters");
    const filters = data.filter ?? [];
    if (!filters.length)
      return text("No filters configured");
    return text(`${filters.length} filter(s):

${filters.map(describe).join(`

`)}`);
  },
  get_filter: async (args, accessToken) => {
    const filterId = requireString(args, "filterId");
    const filter = await gmail(accessToken, `/settings/filters/${filterId}`);
    return text(describe(filter));
  },
  create_filter: async (args, accessToken) => {
    const criteria = args.criteria;
    const action = args.action;
    if (!criteria || !Object.keys(criteria).length) {
      throw new Error("criteria must name at least one condition");
    }
    if (!action || !Object.keys(action).length) {
      throw new Error("action must name at least one effect");
    }
    return await create(accessToken, { criteria, action });
  },
  create_filter_from_template: async (args, accessToken) => {
    const name = requireString(args, "template");
    const template = TEMPLATES[name];
    if (!template) {
      throw new Error(`Unknown template "${name}". Valid: ${Object.keys(TEMPLATES).join(", ")}`);
    }
    return await create(accessToken, template(args.parameters ?? {}));
  },
  delete_filter: async (args, accessToken) => {
    const filterId = requireString(args, "filterId");
    await gmail(accessToken, `/settings/filters/${filterId}`, {
      method: "DELETE"
    });
    return text(`✓ Deleted filter ${filterId}`);
  }
};

// src/palette.ts
var ALLOWED = new Set([
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#cccccc",
  "#efefef",
  "#f3f3f3",
  "#ffffff",
  "#fb4c2f",
  "#ffad47",
  "#fad165",
  "#16a766",
  "#43d692",
  "#4a86e8",
  "#a479e2",
  "#f691b3",
  "#f6c5be",
  "#ffe6c7",
  "#fef1d1",
  "#b9e4d0",
  "#c6f3de",
  "#c9daf8",
  "#e4d7f5",
  "#fcdee8",
  "#efa093",
  "#ffd6a2",
  "#fce8b3",
  "#89d3b2",
  "#a0eac9",
  "#a4c2f4",
  "#d0bcf1",
  "#fbc8d9",
  "#e66550",
  "#ffbc6b",
  "#fcda83",
  "#44b984",
  "#68dfa9",
  "#6d9eeb",
  "#b694e8",
  "#f7a7c0",
  "#cc3a21",
  "#eaa041",
  "#f2c960",
  "#149e60",
  "#3dc789",
  "#3c78d8",
  "#8e63ce",
  "#e07798",
  "#ac2b16",
  "#cf8933",
  "#d5ae49",
  "#0b804b",
  "#2a9c68",
  "#285bac",
  "#653e9b",
  "#b65775",
  "#822111",
  "#a46a21",
  "#aa8831",
  "#076239",
  "#1a764d",
  "#1c4587",
  "#41236d",
  "#83334c",
  "#464646",
  "#e7e7e7",
  "#0d3472",
  "#b6cff5",
  "#0d3b44",
  "#98d7e4",
  "#3d188e",
  "#e3d7ff",
  "#711a36",
  "#fbd3e0",
  "#8a1c0a",
  "#f2b2a8",
  "#7a2e0b",
  "#ffc8af",
  "#7a4706",
  "#ffdeb5",
  "#594c05",
  "#fbe983",
  "#684e07",
  "#fdedc1",
  "#0b4f30",
  "#b3efd3",
  "#04502e",
  "#a2dcc1",
  "#c2c2c2"
]);
var PRESETS = {
  black: { backgroundColor: "#000000", textColor: "#ffffff" },
  gray: { backgroundColor: "#666666", textColor: "#ffffff" },
  white: { backgroundColor: "#ffffff", textColor: "#000000" },
  red: { backgroundColor: "#fb4c2f", textColor: "#ffffff" },
  orange: { backgroundColor: "#ffad47", textColor: "#ffffff" },
  yellow: { backgroundColor: "#fad165", textColor: "#000000" },
  green: { backgroundColor: "#16a766", textColor: "#ffffff" },
  teal: { backgroundColor: "#43d692", textColor: "#ffffff" },
  blue: { backgroundColor: "#4a86e8", textColor: "#ffffff" },
  purple: { backgroundColor: "#a479e2", textColor: "#ffffff" },
  pink: { backgroundColor: "#f691b3", textColor: "#ffffff" },
  brown: { backgroundColor: "#8a1c0a", textColor: "#ffffff" }
};
var DOCS = "https://developers.google.com/gmail/api/reference/rest/v1/users.labels";
function allowed(value, field) {
  const normalized = value.trim().toLowerCase();
  if (!ALLOWED.has(normalized)) {
    throw new Error(`Invalid ${field} "${value}". Gmail only accepts colors from its fixed palette; see ${DOCS}.`);
  }
  return normalized;
}
function resolveColor(input) {
  if (input === undefined || input === null || input === "")
    return;
  if (typeof input === "string") {
    const preset = PRESETS[input.trim().toLowerCase()];
    if (!preset) {
      throw new Error(`Unknown color preset "${input}". Valid presets: ${Object.keys(PRESETS).join(", ")}. Or pass {textColor, backgroundColor}.`);
    }
    return preset;
  }
  const pair = input;
  if (!pair.textColor || !pair.backgroundColor) {
    throw new Error("color needs both textColor and backgroundColor");
  }
  return {
    textColor: allowed(pair.textColor, "textColor"),
    backgroundColor: allowed(pair.backgroundColor, "backgroundColor")
  };
}

// src/handlers/labels.ts
function visibility(args) {
  return {
    ...args.messageListVisibility ? { messageListVisibility: args.messageListVisibility } : {},
    ...args.labelListVisibility ? { labelListVisibility: args.labelListVisibility } : {}
  };
}
function describe2(label) {
  const counts = label.messagesTotal === undefined ? "" : ` — ${label.messagesTotal} message(s), ${label.messagesUnread ?? 0} unread`;
  const color = label.color?.backgroundColor ? ` [${label.color.backgroundColor} on ${label.color.textColor}]` : "";
  return `[${label.id}] ${label.name}${color}${counts}`;
}
async function allLabels(accessToken) {
  const data = await gmail(accessToken, "/labels");
  return data.labels ?? [];
}
var labelHandlers = {
  list_email_labels: async (_args, accessToken) => {
    const labels2 = await allLabels(accessToken);
    if (!labels2.length)
      return text("No labels found");
    const system = labels2.filter((label) => label.type === "system");
    const user = labels2.filter((label) => label.type !== "system");
    const lines = [`${labels2.length} label(s)`, "", "System:"];
    for (const label of system)
      lines.push(`  ${describe2(label)}`);
    lines.push("", "User:");
    for (const label of user)
      lines.push(`  ${describe2(label)}`);
    return text(lines.join(`
`));
  },
  create_label: async (args, accessToken) => {
    const color = resolveColor(args.color);
    const label = await gmail(accessToken, "/labels", {
      method: "POST",
      body: {
        name: requireString(args, "name"),
        ...visibility(args),
        ...color ? { color } : {}
      }
    });
    return text(`✓ Created label ${describe2(label)}`);
  },
  update_label: async (args, accessToken) => {
    const labelId = requireString(args, "labelId");
    const color = resolveColor(args.color);
    const label = await gmail(accessToken, `/labels/${labelId}`, {
      method: "PATCH",
      body: {
        ...args.name ? { name: args.name } : {},
        ...visibility(args),
        ...color ? { color } : {}
      }
    });
    return text(`✓ Updated label ${describe2(label)}`);
  },
  delete_label: async (args, accessToken) => {
    const labelId = requireString(args, "labelId");
    await gmail(accessToken, `/labels/${labelId}`, { method: "DELETE" });
    return text(`✓ Deleted label ${labelId}`);
  },
  get_or_create_label: async (args, accessToken) => {
    const name = requireString(args, "name");
    const existing = (await allLabels(accessToken)).find((label2) => label2.name?.toLowerCase() === name.toLowerCase());
    if (existing)
      return text(`Found existing label ${describe2(existing)}`);
    const color = resolveColor(args.color);
    const label = await gmail(accessToken, "/labels", {
      method: "POST",
      body: { name, ...color ? { color } : {} }
    });
    return text(`✓ Created label ${describe2(label)}`);
  }
};

// src/handlers/messages.ts
function labelChange(args) {
  const addLabelIds = stringList(args.addLabelIds, "addLabelIds");
  const removeLabelIds = stringList(args.removeLabelIds, "removeLabelIds");
  if (!addLabelIds.length && !removeLabelIds.length) {
    throw new Error("pass addLabelIds, removeLabelIds, or both");
  }
  return { addLabelIds, removeLabelIds };
}
async function summarize(accessToken, ids) {
  const messages = await mapLimited(ids, (entry) => gmail(accessToken, `/messages/${entry.id}`, {
    query: {
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"]
    }
  }).catch(() => null));
  return messages.map((message, index) => {
    const fallback = ids[index]?.id ?? "";
    if (!message)
      return `${fallback} (could not be read)`;
    const parsed = parseMessage(message);
    const unread = parsed.labelIds.includes("UNREAD") ? " •" : "";
    return `[${parsed.id}] ${parsed.date} — ${parsed.from}${unread}
  ${parsed.subject || "(no subject)"}  (thread ${parsed.threadId})`;
  });
}
var messageHandlers = {
  send_email: async (args, accessToken) => {
    const fields = readEmailFields(args);
    const sent = await gmail(accessToken, "/messages/send", {
      method: "POST",
      body: {
        raw: encodeRaw(fields),
        ...fields.threadId ? { threadId: fields.threadId } : {}
      }
    });
    return text(`✓ Sent to ${[...fields.to, ...fields.cc, ...fields.bcc].join(", ")}
Message ID: ${sent.id}
Thread ID: ${sent.threadId}`);
  },
  read_email: async (args, accessToken) => {
    const message = await gmail(accessToken, `/messages/${requireString(args, "messageId")}`, { query: { format: "full" } });
    return text(renderMessage(parseMessage(message)));
  },
  search_emails: async (args, accessToken) => {
    const maxResults = Math.min(optionalNumber(args, "maxResults") ?? 20, 100);
    const data = await gmail(accessToken, "/messages", {
      query: {
        q: args.query,
        maxResults,
        pageToken: args.pageToken
      }
    });
    const found = data.messages ?? [];
    if (!found.length)
      return text("No messages matched that query");
    const lines = [
      `Found ${found.length} message(s)${data.resultSizeEstimate ? ` of about ${data.resultSizeEstimate}` : ""}:`,
      "",
      ...await summarize(accessToken, found)
    ];
    if (data.nextPageToken) {
      lines.push("", `\uD83D\uDCC4 More available. pageToken: "${data.nextPageToken}"`);
    }
    return text(lines.join(`
`));
  },
  modify_email: async (args, accessToken) => {
    const messageId = requireString(args, "messageId");
    const change = labelChange(args);
    await gmail(accessToken, `/messages/${messageId}/modify`, {
      method: "POST",
      body: change
    });
    const parts = [];
    if (change.addLabelIds.length)
      parts.push(`added ${change.addLabelIds.join(", ")}`);
    if (change.removeLabelIds.length)
      parts.push(`removed ${change.removeLabelIds.join(", ")}`);
    return text(`✓ Message ${messageId}: ${parts.join("; ")}`);
  },
  delete_email: async (args, accessToken) => {
    const messageId = requireString(args, "messageId");
    await gmail(accessToken, `/messages/${messageId}`, { method: "DELETE" });
    return text(`✓ Permanently deleted message ${messageId}`);
  },
  batch_modify_emails: async (args, accessToken) => {
    const ids = stringList(args.messageIds, "messageIds");
    if (!ids.length)
      throw new Error("messageIds is required");
    const change = labelChange(args);
    await gmail(accessToken, "/messages/batchModify", {
      method: "POST",
      body: { ids, ...change }
    });
    return text(`✓ Modified labels on ${ids.length} message(s)`);
  },
  batch_delete_emails: async (args, accessToken) => {
    const ids = stringList(args.messageIds, "messageIds");
    if (!ids.length)
      throw new Error("messageIds is required");
    await gmail(accessToken, "/messages/batchDelete", {
      method: "POST",
      body: { ids }
    });
    return text(`✓ Permanently deleted ${ids.length} message(s)`);
  },
  get_attachment: async (args, accessToken) => {
    const messageId = requireString(args, "messageId");
    const attachmentId = requireString(args, "attachmentId");
    const data = await gmail(accessToken, `/messages/${messageId}/attachments/${attachmentId}`);
    if (!data.data)
      throw new Error("attachment returned no data");
    return text(`Attachment from ${messageId} (${data.size ?? 0} bytes), base64:

${data.data}`);
  },
  list_history: async (args, accessToken) => {
    const data = await gmail(accessToken, "/history", {
      query: {
        startHistoryId: requireString(args, "startHistoryId"),
        maxResults: optionalNumber(args, "maxResults")
      }
    });
    const history = data.history ?? [];
    if (!history.length) {
      return text(`No changes since that history ID (now ${data.historyId})`);
    }
    return text(`${history.length} change record(s), current history ID ${data.historyId}:

${JSON.stringify(history, null, 2)}`);
  },
  mark_message_spam: async (args, accessToken) => {
    const messageId = requireString(args, "messageId");
    await gmail(accessToken, `/messages/${messageId}/modify`, {
      method: "POST",
      body: { addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] }
    });
    return text(`✓ Marked message ${messageId} as spam`);
  },
  unmark_message_spam: async (args, accessToken) => {
    const messageId = requireString(args, "messageId");
    await gmail(accessToken, `/messages/${messageId}/modify`, {
      method: "POST",
      body: { addLabelIds: ["INBOX"], removeLabelIds: ["SPAM"] }
    });
    return text(`✓ Removed message ${messageId} from spam`);
  }
};

// src/handlers/threads.ts
async function modify(accessToken, threadId, body) {
  await gmail(accessToken, `/threads/${threadId}/modify`, {
    method: "POST",
    body
  });
}
var threadHandlers = {
  read_email_thread: async (args, accessToken) => {
    const threadId = requireString(args, "threadId");
    const thread = await gmail(accessToken, `/threads/${threadId}`, {
      query: { format: "full" }
    });
    const messages = thread.messages ?? [];
    if (!messages.length)
      return text(`Thread ${threadId} has no messages`);
    const parsed = messages.map(parseMessage);
    const lines = [
      `Thread ${threadId} — ${messages.length} message(s)`,
      `Subject: ${parsed[0]?.subject || "(no subject)"}`
    ];
    parsed.forEach((message, index) => {
      lines.push("", `── Message ${index + 1} of ${parsed.length} ──`);
      lines.push(renderMessage(message));
    });
    return text(lines.join(`
`));
  },
  modify_thread: async (args, accessToken) => {
    const threadId = requireString(args, "threadId");
    const addLabelIds = stringList(args.addLabelIds, "addLabelIds");
    const removeLabelIds = stringList(args.removeLabelIds, "removeLabelIds");
    if (!addLabelIds.length && !removeLabelIds.length) {
      throw new Error("pass addLabelIds, removeLabelIds, or both");
    }
    await modify(accessToken, threadId, { addLabelIds, removeLabelIds });
    const parts = [];
    if (addLabelIds.length)
      parts.push(`added ${addLabelIds.join(", ")}`);
    if (removeLabelIds.length)
      parts.push(`removed ${removeLabelIds.join(", ")}`);
    return text(`✓ Thread ${threadId}: ${parts.join("; ")}`);
  },
  trash_thread: async (args, accessToken) => {
    const threadId = requireString(args, "threadId");
    await gmail(accessToken, `/threads/${threadId}/trash`, { method: "POST" });
    return text(`✓ Moved thread ${threadId} to Trash`);
  },
  untrash_thread: async (args, accessToken) => {
    const threadId = requireString(args, "threadId");
    await gmail(accessToken, `/threads/${threadId}/untrash`, {
      method: "POST"
    });
    return text(`✓ Restored thread ${threadId} from Trash`);
  },
  delete_thread: async (args, accessToken) => {
    const threadId = requireString(args, "threadId");
    await gmail(accessToken, `/threads/${threadId}`, { method: "DELETE" });
    return text(`✓ Permanently deleted thread ${threadId}`);
  },
  mark_thread_spam: async (args, accessToken) => {
    const threadId = requireString(args, "threadId");
    await modify(accessToken, threadId, {
      addLabelIds: ["SPAM"],
      removeLabelIds: ["INBOX"]
    });
    return text(`✓ Marked thread ${threadId} as spam`);
  },
  unmark_thread_spam: async (args, accessToken) => {
    const threadId = requireString(args, "threadId");
    await modify(accessToken, threadId, {
      addLabelIds: ["INBOX"],
      removeLabelIds: ["SPAM"]
    });
    return text(`✓ Removed thread ${threadId} from spam`);
  }
};

// src/handlers/index.ts
var HANDLERS = {
  ...messageHandlers,
  ...draftHandlers,
  ...threadHandlers,
  ...labelHandlers,
  ...filterHandlers
};
async function callTool(name, args, accessToken) {
  if (!accessToken)
    return failure("Not connected; connect the plugin first.");
  const handler = HANDLERS[name];
  if (!handler)
    return failure(`Unknown tool: ${name}`);
  try {
    return await handler(args, accessToken);
  } catch (error) {
    return failure(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// src/tools.ts
function tool(name, description, properties, required2, readOnly, destructive = false) {
  return {
    name,
    description,
    inputSchema: { type: "object", properties, required: required2 },
    annotations: { readOnlyHint: readOnly, destructiveHint: destructive }
  };
}
var MESSAGE_ID = {
  type: "string",
  description: "Gmail message ID, e.g. 18f2a1b3c4d5e6f7."
};
var THREAD_ID = {
  type: "string",
  description: "Gmail thread ID. A thread groups a conversation's messages."
};
var DRAFT_ID = { type: "string", description: "Gmail draft ID." };
var LABEL_ID = {
  type: "string",
  description: "Label ID. System labels use their name (INBOX, UNREAD, STARRED, SPAM, TRASH, IMPORTANT); user labels use an opaque id from list_email_labels."
};
var ADD_LABELS = {
  type: "array",
  items: { type: "string" },
  description: "Label IDs to add."
};
var REMOVE_LABELS = {
  type: "array",
  items: { type: "string" },
  description: "Label IDs to remove."
};
var COLOR = {
  description: `Label color: a preset name (${Object.keys(PRESETS).join(", ")}) or an explicit {textColor, backgroundColor} pair. Gmail only accepts values from its fixed palette.`,
  oneOf: [
    { type: "string" },
    {
      type: "object",
      properties: {
        textColor: { type: "string" },
        backgroundColor: { type: "string" }
      },
      required: ["textColor", "backgroundColor"]
    }
  ]
};
var COMPOSE = {
  to: {
    type: "array",
    items: { type: "string" },
    description: 'Recipients, e.g. ["a@example.com", "Name <b@example.com>"].'
  },
  cc: {
    type: "array",
    items: { type: "string" },
    description: "Cc addresses."
  },
  bcc: {
    type: "array",
    items: { type: "string" },
    description: "Bcc addresses."
  },
  subject: { type: "string", description: "Subject line." },
  body: { type: "string", description: "Plain-text body." },
  htmlBody: {
    type: "string",
    description: "Optional HTML body. When set, the message is sent multipart/alternative with body as the plain-text fallback."
  },
  attachments: {
    type: "array",
    description: "Files to attach.",
    items: {
      type: "object",
      properties: {
        filename: { type: "string" },
        content: { type: "string", description: "Base64-encoded file bytes." },
        mimeType: {
          type: "string",
          description: "Defaults to application/octet-stream."
        }
      },
      required: ["filename", "content"]
    }
  },
  inReplyTo: {
    type: "string",
    description: "RFC Message-ID of the message being replied to, e.g. <abc@mail.gmail.com>. Read it from read_email's Message ID header."
  },
  references: {
    type: "string",
    description: "References header; defaults to inReplyTo when omitted."
  },
  threadId: {
    type: "string",
    description: "Thread to attach this message to, for replies."
  }
};
function getTools() {
  return [
    tool("send_email", "Sends a new email immediately", COMPOSE, ["body"], false, true),
    tool("draft_email", "Creates a draft email without sending it", COMPOSE, ["body"], false),
    tool("read_email", "Retrieves the full content of a specific email, including headers, body, and attachment references", { messageId: MESSAGE_ID }, ["messageId"], true),
    tool("read_email_thread", "Retrieves every message in a thread in readable order", { threadId: THREAD_ID }, ["threadId"], true),
    tool("search_emails", "Searches emails using Gmail search syntax, e.g. 'from:me is:unread after:2026/01/01'", {
      query: {
        type: "string",
        description: "Gmail search query. Empty matches everything."
      },
      maxResults: {
        type: "number",
        description: "Maximum messages to return (default 20, max 100)."
      },
      pageToken: {
        type: "string",
        description: "Page token from a previous search_emails call."
      }
    }, [], true),
    tool("modify_email", "Adds or removes labels on a single message, which is how mail is archived, starred, or marked read", {
      messageId: MESSAGE_ID,
      addLabelIds: ADD_LABELS,
      removeLabelIds: REMOVE_LABELS
    }, ["messageId"], false),
    tool("delete_email", "Permanently deletes a message. This cannot be undone; prefer modify_email with addLabelIds ['TRASH']", { messageId: MESSAGE_ID }, ["messageId"], false, true),
    tool("batch_modify_emails", "Adds or removes labels on up to 1000 messages in one call", {
      messageIds: {
        type: "array",
        items: { type: "string" },
        description: "Message IDs to modify."
      },
      addLabelIds: ADD_LABELS,
      removeLabelIds: REMOVE_LABELS
    }, ["messageIds"], false),
    tool("batch_delete_emails", "Permanently deletes up to 1000 messages. This cannot be undone", {
      messageIds: {
        type: "array",
        items: { type: "string" },
        description: "Message IDs to delete."
      }
    }, ["messageIds"], false, true),
    tool("get_attachment", "Fetches an attachment's bytes as base64. Attachment IDs come from read_email", { messageId: MESSAGE_ID, attachmentId: { type: "string" } }, ["messageId", "attachmentId"], true),
    tool("list_history", "Lists mailbox changes since a history ID, for detecting what changed", {
      startHistoryId: {
        type: "string",
        description: "History ID to start from."
      },
      maxResults: { type: "number", description: "Maximum records." }
    }, ["startHistoryId"], true),
    tool("list_drafts", "Lists draft emails", {
      maxResults: {
        type: "number",
        description: "Maximum drafts (max 100)."
      },
      query: { type: "string", description: "Gmail search query." }
    }, [], true),
    tool("get_draft", "Retrieves a draft's full content", { draftId: DRAFT_ID }, ["draftId"], true),
    tool("update_draft", "Replaces a draft's content. Omitted fields are not preserved", { draftId: DRAFT_ID, ...COMPOSE }, ["draftId", "body"], false),
    tool("delete_draft", "Permanently deletes a draft", { draftId: DRAFT_ID }, ["draftId"], false, true),
    tool("send_draft", "Sends an existing draft", { draftId: DRAFT_ID }, ["draftId"], false, true),
    tool("modify_thread", "Adds or removes labels on every message in a thread", {
      threadId: THREAD_ID,
      addLabelIds: ADD_LABELS,
      removeLabelIds: REMOVE_LABELS
    }, ["threadId"], false),
    tool("trash_thread", "Moves a whole thread to Trash, which is reversible with untrash_thread", { threadId: THREAD_ID }, ["threadId"], false),
    tool("untrash_thread", "Restores a thread from Trash", { threadId: THREAD_ID }, ["threadId"], false),
    tool("delete_thread", "Permanently deletes a whole thread. This cannot be undone", { threadId: THREAD_ID }, ["threadId"], false, true),
    tool("mark_message_spam", "Marks a message as spam and removes it from the inbox", { messageId: MESSAGE_ID }, ["messageId"], false),
    tool("unmark_message_spam", "Removes a message from spam and returns it to the inbox", { messageId: MESSAGE_ID }, ["messageId"], false),
    tool("mark_thread_spam", "Marks a whole thread as spam and removes it from the inbox", { threadId: THREAD_ID }, ["threadId"], false),
    tool("unmark_thread_spam", "Removes a thread from spam and returns it to the inbox", { threadId: THREAD_ID }, ["threadId"], false),
    tool("list_email_labels", "Lists every label in the mailbox", {}, [], true),
    tool("create_label", "Creates a label, optionally with a color from Gmail's fixed palette", {
      name: {
        type: "string",
        description: "Label name. Use 'Parent/Child' for nesting."
      },
      color: COLOR,
      messageListVisibility: {
        type: "string",
        enum: ["show", "hide"],
        description: "Whether messages with this label show in the list."
      },
      labelListVisibility: {
        type: "string",
        enum: ["labelShow", "labelShowIfUnread", "labelHide"],
        description: "Whether the label shows in the sidebar."
      }
    }, ["name"], false),
    tool("update_label", "Renames or recolors an existing label. Omitted fields are preserved", {
      labelId: LABEL_ID,
      name: { type: "string" },
      color: COLOR,
      messageListVisibility: { type: "string", enum: ["show", "hide"] },
      labelListVisibility: {
        type: "string",
        enum: ["labelShow", "labelShowIfUnread", "labelHide"]
      }
    }, ["labelId"], false),
    tool("delete_label", "Deletes a label and removes it from every message carrying it", { labelId: LABEL_ID }, ["labelId"], false, true),
    tool("get_or_create_label", "Returns a label by name, creating it if it does not exist", { name: { type: "string" }, color: COLOR }, ["name"], false),
    tool("list_filters", "Lists every Gmail filter", {}, [], true),
    tool("get_filter", "Retrieves one filter's criteria and actions", { filterId: { type: "string" } }, ["filterId"], true),
    tool("create_filter", "Creates a filter from raw criteria and actions", {
      criteria: {
        type: "object",
        description: "Match conditions.",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          subject: { type: "string" },
          query: { type: "string", description: "Gmail search syntax." },
          negatedQuery: { type: "string" },
          hasAttachment: { type: "boolean" },
          excludeChats: { type: "boolean" },
          size: { type: "number", description: "Size in bytes." },
          sizeComparison: { type: "string", enum: ["larger", "smaller"] }
        }
      },
      action: {
        type: "object",
        description: "What to do with matches.",
        properties: {
          addLabelIds: { type: "array", items: { type: "string" } },
          removeLabelIds: { type: "array", items: { type: "string" } },
          forward: { type: "string" }
        }
      }
    }, ["criteria", "action"], false),
    tool("create_filter_from_template", "Creates a filter from a named template instead of raw criteria", {
      template: {
        type: "string",
        enum: [
          "fromSender",
          "withSubject",
          "withAttachments",
          "largeEmails",
          "containingText",
          "mailingList"
        ]
      },
      parameters: {
        type: "object",
        properties: {
          senderEmail: { type: "string" },
          subjectText: { type: "string" },
          searchText: { type: "string" },
          listIdentifier: { type: "string" },
          sizeInBytes: { type: "number" },
          labelIds: { type: "array", items: { type: "string" } },
          archive: { type: "boolean" },
          markAsRead: { type: "boolean" },
          markImportant: { type: "boolean" }
        }
      }
    }, ["template", "parameters"], false),
    tool("delete_filter", "Deletes a filter. Mail it already acted on is unaffected", { filterId: { type: "string" } }, ["filterId"], false, true)
  ];
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
