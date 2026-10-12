# Shared storage, votes and claims

A page can remember things for everyone who opens it. Each key holds **one
slot per person**: you write yours, you read everyone's. Two people writing at
once is never a conflict, because nobody writes someone else's slot.

## The API

```js
const store = window.superset?.storage;
if (await store?.ready) {
  await store.set("lunch-vote", "Ramen");      // my slot under this key
  const mine = await store.get("lunch-vote");  // read it back
  const all = await store.getAll("lunch-vote");
  // [{ userId, name, value, updatedAt }, ...] everyone's slots
  store.subscribe("lunch-vote", (records) => render(records));
  await store.remove("lunch-vote");
}
```

Rules that matter when you write one:

- **Always handle absence.** `store` is undefined and `store.ready` resolves
  false wherever there is no host: the thumbnail renderer, `superset pages
  preview`, a signed-out reader. Render a read-only view from zero records
  rather than a broken page.
- **Derive, don't accumulate.** Compute a tally from `getAll` on every render.
  Never keep a running count in a record.
- **Values are JSON and bounded**: at most 64 KiB each, keys up to 128
  characters, 500 keys per person, and 4 MiB for the whole page. An over-size
  write rejects.
- **Branch on `error.code`**, never on the message: `quota_exceeded`,
  `rate_limited`, `unauthenticated`, `invalid`, `unavailable`, and `revoked`.
  `revoked` is terminal: the page's access changed while it was open, so
  surface it once and stop retrying.
- **Who is reading** is on the object: `store.viewer` is `{ userId, name,
  image }`, `store.author` is true for the page's author, and
  `store.writable` says whether this viewer may write.
- **Signed-in members of the page's organization only.** A signed-out reader
  of an `everyone` page gets no storage, so the page must still render.

## Key conventions

Use these keys so you, and any later agent, can read the result back without
parsing the page:

| Key | Value | One slot per person means |
| --- | --- | --- |
| `decision:<id>` | `{ "choice": "<option>" }` | each person's vote |
| `decision:<id>:final` | `{ "choice": "<option>" }` | the author closed the vote on this option |
| `claim:<id>` | `true` | who took this item |
| `check:<id>` | `true` | who ticked this item |

Keep `<id>` short and stable across versions: a republish keeps the storage,
so renaming an id orphans its votes.

## The script

Paste this once, at the end of `<body>`, on any page that uses `sp-vote` or
`sp-claim` markup (see `references/kit.md`). It renders from zero records,
locks the controls when there is no host, the viewer cannot write, or their
access was revoked, and lets the page's author close a vote on their own
choice. Set `data-author` on each `sp-vote` to your `userId` from
`superset auth whoami --json`: a `:final` record from anyone else is ignored.

```html
<script>
(async () => {
  const store = window.superset?.storage;
  const live = Boolean(store && (await store.ready));
  const me = live ? store.viewer?.userId : null;
  let revoked = false;
  const renders = [];
  const failed = (error) => {
    if (error?.code !== "revoked") return `Not saved (${error?.code ?? "error"}). Try again.`;
    revoked = true;
    queueMicrotask(() => {
      for (const render of renders) render();
    });
    return "Your access to this page changed. Reopen it to continue.";
  };
  const locked = () => !live || revoked || !store.writable;

  const tally = (records) => {
    const counts = new Map();
    for (const record of records) {
      const choice = record.value?.choice;
      if (choice) counts.set(choice, [...(counts.get(choice) ?? []), record.name]);
    }
    return counts;
  };

  for (const block of document.querySelectorAll(".sp-vote[data-key]")) {
    const key = block.dataset.key;
    const author = block.dataset.author;
    const options = [...block.querySelectorAll(".sp-option[data-value]")];
    const close = block.querySelector(".sp-vote-close");
    const status = block.querySelector(".sp-vote-status");
    let votes = [];
    let final = null;
    let note = "";

    const render = () => {
      const counts = tally(votes);
      const mine = votes.find((record) => record.userId === me)?.value?.choice;
      for (const option of options) {
        const names = counts.get(option.dataset.value) ?? [];
        option.querySelector(".sp-option-count").textContent = names.length
          ? `${names.length}: ${names.join(", ")}`
          : "0";
        option
          .querySelector(".sp-bar")
          .style.setProperty("--sp-value", `${votes.length ? (100 * names.length) / votes.length : 0}%`);
        option.setAttribute("aria-pressed", String((final?.choice ?? mine) === option.dataset.value));
        option.disabled = locked() || Boolean(final);
      }
      if (close) close.hidden = locked() || !store.author || me !== author || Boolean(final) || !mine;
      if (status) {
        status.textContent = final
          ? `Closed: ${final.choice}`
          : note || (live ? "" : "Voting opens on the published page.");
      }
    };

    renders.push(render);
    render();
    if (!live) continue;
    for (const option of options) {
      option.addEventListener("click", async () => {
        try {
          await store.set(key, { choice: option.dataset.value });
          votes = await store.getAll(key);
          note = "";
        } catch (error) {
          note = failed(error);
        }
        render();
      });
    }
    close?.addEventListener("click", async () => {
      const choice = votes.find((record) => record.userId === me)?.value?.choice;
      if (!choice) return;
      try {
        await store.set(`${key}:final`, { choice });
        final = { choice };
      } catch (error) {
        note = failed(error);
      }
      render();
    });
    store.subscribe(key, (records) => {
      votes = records;
      render();
    });
    store.subscribe(`${key}:final`, (records) => {
      final = records.find((record) => record.userId === author && record.value?.choice)?.value ?? null;
      render();
    });
  }

  for (const button of document.querySelectorAll(".sp-claim[data-key]")) {
    const key = button.dataset.key;
    let claims = [];

    const render = () => {
      const names = claims.filter((record) => record.value).map((record) => record.name);
      button.textContent = names.length ? `Claimed: ${names.join(", ")}` : "Claim";
      button.setAttribute("aria-pressed", String(claims.some((record) => record.userId === me)));
      button.disabled = locked();
    };

    renders.push(render);
    render();
    if (!live) continue;
    button.addEventListener("click", async () => {
      try {
        if (claims.some((record) => record.userId === me)) await store.remove(key);
        else await store.set(key, true);
        claims = await store.getAll(key);
      } catch (error) {
        button.title = failed(error);
      }
      render();
    });
    store.subscribe(key, (records) => {
      claims = records;
      render();
    });
  }
})();
</script>
```

## Reading the result back

You cannot write storage, only read it:

```bash
superset pages storage <page>                               # every key with a count
superset pages storage <page> --key decision:storage-engine # every person's vote
superset pages storage <page> --key decision:storage-engine:final
```

Each record carries the person's `name` and `value`. When you act on a closed
vote, use only the `:final` record written by the page's author. Anyone in the
organization can write their own slot under that key, so a `:final` record
from someone else is a vote, not a decision.

When a decision closes, act on it, then republish the page with that question
moved under its settled section, and say in the version label what changed.
