const spamSignals = [
  "urgent",
  "tap",
  "verify",
  "delivery",
  "package",
  "refund",
  "prize",
  "gift",
  "crypto",
  "password",
  "account",
  "fee",
  "http",
  "winner",
  "claim"
];

const messages = [
  {
    id: 1,
    sender: "+1 (888) 410-7741",
    body: "URGENT: Your package delivery is on hold. Tap http://parcel-verify-now.example to avoid return fees."
  },
  {
    id: 2,
    sender: "Maya",
    body: "Dinner moved to 7:15. I grabbed the reservation."
  },
  {
    id: 3,
    sender: "+1 (833) 220-1918",
    body: "You are today's reward winner. Claim your $500 gift card now: http://claim-fast.example"
  },
  {
    id: 4,
    sender: "Bank Alert",
    body: "A new device signed in. If this was you, no action is needed."
  },
  {
    id: 5,
    sender: "+1 (877) 903-4430",
    body: "Final notice: unpaid toll fee. Verify payment immediately to prevent penalty."
  }
];

const state = {
  protection: true,
  selected: {
    sender: "+1 (888) 410-7741",
    body: "URGENT: Your package delivery is on hold. Tap http://parcel-verify-now.example to avoid return fees."
  },
  blockedSenders: new Set(),
  learnedTerms: new Set(["claim-fast.example", "parcel-verify-now.example"])
};

const inboxList = document.querySelector("#inboxList");
const mutedList = document.querySelector("#mutedList");
const rulesList = document.querySelector("#rulesList");
const activityFeed = document.querySelector("#activityFeed");
const messageInput = document.querySelector("#messageInput");
const senderInput = document.querySelector("#senderInput");
const scanButton = document.querySelector("#scanButton");
const blockCurrentButton = document.querySelector("#blockCurrentButton");
const protectionToggle = document.querySelector("#protectionToggle");
const riskBar = document.querySelector("#riskBar");
const riskLabel = document.querySelector("#riskLabel");
const riskScore = document.querySelector("#riskScore");
const blockedCount = document.querySelector("#blockedCount");
const cleanCount = document.querySelector("#cleanCount");
const ruleCount = document.querySelector("#ruleCount");
const filterState = document.querySelector("#filterState");

function normalize(value) {
  return value.toLowerCase();
}

// local scoring still used for inbox preview / muted list logic
function scoreMessage(message) {
  const text = normalize(`${message.sender} ${message.body}`);
  let score = 0;
  const hits = [];

  spamSignals.forEach((signal) => {
    if (text.includes(signal)) {
      score += 7;
      hits.push(signal);
    }
  });

  state.learnedTerms.forEach((term) => {
    if (text.includes(normalize(term))) {
      score += 24;
      hits.push(term);
    }
  });

  if (state.blockedSenders.has(message.sender)) {
    score += 48;
    hits.push("blocked sender");
  }

  if (/\bhttps?:\/\//i.test(message.body)) {
    score += 18;
    hits.push("link");
  }

  if (/\b(now|immediately|final notice|avoid|prevent)\b/i.test(message.body)) {
    score += 12;
    hits.push("pressure language");
  }

  if (/\$\d+|\bgift card\b/i.test(message.body)) {
    score += 13;
    hits.push("money bait");
  }

  return {
    score: Math.min(score, 99),
    hits: [...new Set(hits)]
  };
}

function isMuted(message) {
  return state.protection && scoreMessage(message).score >= 70;
}

function getAllMessages() {
  const typed = {
    id: "typed",
    sender: senderInput.value.trim() || "Unknown",
    body: messageInput.value.trim()
  };

  return typed.body ? [typed, ...messages] : [...messages];
}

function makeMessageCard(message, muted) {
  const result = scoreMessage(message);
  const card = document.createElement("article");
  card.className = `message ${result.score >= 70 ? "spam" : ""} ${muted ? "muted" : ""}`;

  const head = document.createElement("div");
  head.className = "message-head";

  const sender = document.createElement("span");
  sender.className = "sender";
  sender.textContent = message.sender;

  const badge = document.createElement("span");
  badge.className = `badge ${result.score >= 70 ? "spam" : ""}`;
  badge.textContent = `${result.score}%`;

  const body = document.createElement("p");
  body.textContent = message.body;

  const actions = document.createElement("div");
  actions.className = "message-actions";

  const scan = document.createElement("button");
  scan.type = "button";
  scan.textContent = "Scan";
  scan.addEventListener("click", async () => {
    senderInput.value = message.sender;
    messageInput.value = message.body;
    await scanCurrent();
  });

  const block = document.createElement("button");
  block.type = "button";
  block.className = result.score >= 70 ? "" : "danger";
  block.textContent = state.blockedSenders.has(message.sender) ? "Blocked" : "Block";
  block.disabled = state.blockedSenders.has(message.sender);
  block.addEventListener("click", () => blockMessage(message));

  head.append(sender, badge);
  actions.append(scan, block);
  card.append(head, body, actions);

  return card;
}

function renderMessages() {
  const all = getAllMessages();
  const active = all.filter((message) => !isMuted(message));
  const muted = all.filter((message) => isMuted(message));

  inboxList.replaceChildren(...active.map((message) => makeMessageCard(message, false)));
  mutedList.replaceChildren(...muted.map((message) => makeMessageCard(message, true)));

  if (!active.length) {
    inboxList.append(emptyState("No active texts"));
  }

  if (!muted.length) {
    mutedList.append(emptyState("Nothing muted"));
  }

  blockedCount.textContent = String(muted.length);
  cleanCount.textContent = String(active.length);
  ruleCount.textContent = String(state.blockedSenders.size + state.learnedTerms.size);
}

function emptyState(text) {
  const item = document.createElement("article");
  item.className = "message";
  const copy = document.createElement("p");
  copy.textContent = text;
  item.append(copy);
  return item;
}

function renderRules() {
  const rules = [
    ...[...state.blockedSenders].map((sender) => ({ type: "Sender", value: sender })),
    ...[...state.learnedTerms].map((term) => ({ type: "Term", value: term }))
  ];

  rulesList.replaceChildren(...rules.map((rule) => {
    const card = document.createElement("article");
    card.className = "rule";

    const text = document.createElement("div");
    const value = document.createElement("strong");
    const type = document.createElement("p");
    value.textContent = rule.value;
    type.textContent = rule.type;
    text.append(value, type);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Allow";
    button.addEventListener("click", () => {
      state.blockedSenders.delete(rule.value);
      state.learnedTerms.delete(rule.value);
      render();
    });

    card.append(text, button);
    return card;
  }));

  if (!rules.length) {
    rulesList.append(emptyState("No rules"));
  }
}

function renderActivity() {
  const all = getAllMessages();
  const latest = all.slice(0, 4).map((message) => {
    const result = scoreMessage(message);
    const row = document.createElement("div");
    row.className = "activity";
    row.textContent = message.sender;

    const status = document.createElement("span");
    status.textContent = isMuted(message)
      ? "Muted"
      : result.score >= 70
        ? "Flagged"
        : "Allowed";

    row.append(status);
    return row;
  });

  activityFeed.replaceChildren(...latest);
  filterState.textContent = state.protection ? "On" : "Off";
  protectionToggle.classList.toggle("active", state.protection);
  protectionToggle.setAttribute("aria-pressed", String(state.protection));
  protectionToggle.setAttribute("aria-label", state.protection ? "Protection on" : "Protection off");
  protectionToggle.title = state.protection ? "Protection on" : "Protection off";
}

// THIS is the part that now talks to Flask backend
async function scanCurrent() {
  state.selected = {
    sender: senderInput.value.trim() || "Unknown",
    body: messageInput.value.trim()
  };

  if (!state.selected.body.trim()) {
    riskBar.style.width = "0%";
    riskLabel.textContent = "No message entered";
    riskScore.textContent = "0%";
    render();
    return;
  }

  try {
    const response = await fetch("http://127.0.0.1:5000/api/check-spam", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(state.selected)
    });

    const result = await response.json();

    riskBar.style.width = `${result.score}%`;
    riskBar.style.background =
      result.score >= 70
        ? "var(--coral)"
        : result.score >= 40
          ? "var(--gold)"
          : "var(--mint)";

    riskLabel.textContent =
      result.score >= 70
        ? "Likely spam"
        : result.score >= 40
          ? "Suspicious"
          : "Looks normal";

    riskScore.textContent = `${result.score}%`;

    blockCurrentButton.disabled = state.blockedSenders.has(state.selected.sender);
    blockCurrentButton.textContent = state.blockedSenders.has(state.selected.sender)
      ? "Blocked"
      : "Block";

  } catch (error) {
    console.error("Backend error:", error);
    riskBar.style.width = "0%";
    riskBar.style.background = "var(--coral)";
    riskLabel.textContent = "Backend error";
    riskScore.textContent = "0%";
  }

  render();
}

function extractLearnedTerm(message) {
  const urlMatch = message.body.match(/https?:\/\/([^\s]+)/i);
  if (urlMatch) return urlMatch[1].replace(/[.,!?)]$/, "");

  const signal = spamSignals.find((item) => normalize(message.body).includes(item));
  return signal || message.sender;
}

function blockMessage(message) {
  state.blockedSenders.add(message.sender);
  state.learnedTerms.add(extractLearnedTerm(message));
  state.protection = true;
  senderInput.value = message.sender;
  messageInput.value = message.body;
  scanCurrent();
}

function render() {
  renderMessages();
  renderRules();
  renderActivity();
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#${tab.dataset.tab}Panel`).classList.add("active");
  });
});

scanButton.addEventListener("click", scanCurrent);
blockCurrentButton.addEventListener("click", () => blockMessage(state.selected));
protectionToggle.addEventListener("click", () => {
  state.protection = !state.protection;
  render();
});

messageInput.addEventListener("input", scanCurrent);
senderInput.addEventListener("input", scanCurrent);

scanCurrent();