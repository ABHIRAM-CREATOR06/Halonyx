/* Aegisus local threat watchlist and security knowledge base. */
(function (root) {
  "use strict";

  const CONFIG_KEY = "halonyx_aegisus_threat_config_v1";
  const INCIDENTS_KEY = "halonyx_aegisus_threat_incidents_v1";
  const MAX_INDICATORS = 500;
  const MAX_INCIDENTS = 100;
  const DEFAULT_CONFIG = { enabled: true, mode: "BLOCK", indicators: [] };

  function randomId() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return root.crypto.randomUUID();
    }
    return `ioc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function readJson(key, fallback) {
    try {
      const raw = root.localStorage && root.localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      if (!root.localStorage) return false;
      root.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      setStatus("Could not save locally. Check this browser’s storage settings.", true);
      return false;
    }
  }

  function validIpv4(value) {
    const parts = value.split(".");
    return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  }

  function normalizeIndicator(type, value) {
    let normalized = String(value || "").trim();
    if (type === "domain") {
      if (!normalized || /\s/.test(normalized)) throw new Error("Enter a valid domain or HTTP(S) URL.");
      let host = normalized;
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) || normalized.includes("/") || normalized.includes("?")) {
        try {
          const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) ? normalized : `https://${normalized}`);
          if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) throw new Error();
          host = parsed.hostname;
        } catch (_) {
          throw new Error("Enter a valid domain or HTTP(S) URL without credentials.");
        }
      }
      host = host.toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
      if (host.length > 253 || !host.includes(".") || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)) {
        throw new Error("Enter a valid domain name.");
      }
      return host;
    }
    if (type === "ipv4") {
      if (!validIpv4(normalized)) throw new Error("Enter a valid IPv4 address.");
      return normalized.split(".").map(Number).join(".");
    }
    if (type === "sha256") {
      normalized = normalized.toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error("Enter a 64-character SHA-256 hash.");
      return normalized;
    }
    throw new Error("Choose a supported indicator type.");
  }

  function loadConfig() {
    const stored = readJson(CONFIG_KEY, null);
    if (!stored || typeof stored !== "object") return { ...DEFAULT_CONFIG, indicators: [] };
    const indicators = Array.isArray(stored.indicators) ? stored.indicators.slice(0, MAX_INDICATORS).flatMap((item) => {
      try {
        if (!item || typeof item !== "object") return [];
        const type = item.type;
        const value = normalizeIndicator(type, item.value);
        return [{
          id: String(item.id || randomId()),
          type,
          value,
          label: String(item.label || "").slice(0, 80),
          enabled: item.enabled !== false,
          createdAt: Number(item.createdAt) || Date.now(),
        }];
      } catch (_) {
        return [];
      }
    }) : [];
    return {
      enabled: stored.enabled !== false,
      mode: stored.mode === "WARN" ? "WARN" : "BLOCK",
      indicators,
    };
  }

  let config = loadConfig();

  function saveConfig() {
    const persisted = writeJson(CONFIG_KEY, config);
    renderIndicatorList();
    return persisted;
  }

  function addIndicator(type, value, label) {
    const normalized = normalizeIndicator(type, value);
    if (config.indicators.some((item) => item.type === type && item.value === normalized)) {
      throw new Error("That indicator is already in the watchlist.");
    }
    if (config.indicators.length >= MAX_INDICATORS) throw new Error(`The watchlist is limited to ${MAX_INDICATORS} indicators.`);
    const item = {
      id: randomId(), type, value: normalized,
      label: String(label || "").trim().slice(0, 80), enabled: true, createdAt: Date.now(),
    };
    config.indicators.push(item);
    const persisted = saveConfig();
    return { ...item, persisted };
  }

  function updateIndicator(id, patch) {
    const item = config.indicators.find((entry) => entry.id === id);
    if (!item) return false;
    if (Object.prototype.hasOwnProperty.call(patch, "enabled")) item.enabled = !!patch.enabled;
    saveConfig();
    return true;
  }

  function removeIndicator(id) {
    const before = config.indicators.length;
    config.indicators = config.indicators.filter((entry) => entry.id !== id);
    if (config.indicators.length === before) return false;
    saveConfig();
    return true;
  }

  function setOptions(options) {
    if (typeof options.enabled === "boolean") config.enabled = options.enabled;
    if (options.mode === "WARN" || options.mode === "BLOCK") config.mode = options.mode;
    const persisted = saveConfig();
    if (!persisted) setStatus("Changed for this session, but the browser could not save this setting.", true);
    return getConfig();
  }

  function getConfig() {
    return JSON.parse(JSON.stringify(config));
  }

  function makeMatcher(indicator) {
    const escaped = indicator.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (indicator.type === "domain") {
      return new RegExp(`(?<![a-z0-9.-])(?:[a-z0-9-]+\\.)*${escaped}(?::\\d{1,5})?(?=$|[/:?#\\s)\\]}>,'\"!])`, "ig");
    }
    if (indicator.type === "ipv4") return new RegExp(`(?<![0-9.])${escaped}(?![0-9.])`, "g");
    return new RegExp(`(?<![a-f0-9])${escaped}(?![a-f0-9])`, "ig");
  }

  function maskIndicator(value) {
    const text = String(value || "");
    if (text.length <= 8) return `${text.slice(0, 2)}•••`;
    return `${text.slice(0, 4)}${"•".repeat(Math.min(12, text.length - 8))}${text.slice(-4)}`;
  }

  function scan(text) {
    const source = String(text || "");
    const matches = [];
    if (!config.enabled || !source) return { enabled: config.enabled, mode: config.mode, matches };
    for (const indicator of config.indicators) {
      if (!indicator.enabled) continue;
      const matcher = makeMatcher(indicator);
      const match = matcher.exec(source);
      if (!match) continue;
      matches.push({
        id: indicator.id,
        type: indicator.type,
        value: indicator.value,
        label: indicator.label,
        matchedText: match[0],
        ruleId: `LOCAL_IOC_${indicator.type.toUpperCase()}`,
        ruleName: indicator.label || `Watchlisted ${indicator.type}`,
        category: "threatIntel",
        categoryLabel: "Local Threat Watchlist",
        severity: "high",
        maskedSnippet: maskIndicator(match[0]),
        index: match.index,
      });
    }
    return { enabled: config.enabled, mode: config.mode, matches };
  }

  function getIncidents() {
    const entries = readJson(INCIDENTS_KEY, []);
    return Array.isArray(entries) ? entries.slice(-MAX_INCIDENTS).reverse() : [];
  }

  function logIncident(matches, action, context) {
    if (!Array.isArray(matches) || !matches.length) return;
    const entries = readJson(INCIDENTS_KEY, []);
    const log = Array.isArray(entries) ? entries : [];
    matches.forEach((match) => log.push({
      id: randomId(),
      timestamp: new Date().toISOString(),
      indicatorId: match.id,
      indicatorType: match.type,
      indicatorLabel: match.label || match.ruleName,
      action,
      targetContext: String(context || "Chat").slice(0, 80),
    }));
    writeJson(INCIDENTS_KEY, log.slice(-MAX_INCIDENTS));
    renderThreatIncidentCount();
  }

  function setStatus(message, isError) {
    const status = document.getElementById("aegisus-threat-status");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error", !!isError);
    status.hidden = !message;
  }

  function renderThreatIncidentCount() {
    const node = document.getElementById("aegisus-threat-incidents");
    if (node) node.textContent = `${getIncidents().length} local alert${getIncidents().length === 1 ? "" : "s"}`;
  }

  function renderIndicatorList() {
    const list = document.getElementById("aegisus-indicator-list");
    const counter = document.getElementById("aegisus-indicator-count");
    if (!list) return;
    list.replaceChildren();
    if (counter) counter.textContent = `${config.indicators.length} indicator${config.indicators.length === 1 ? "" : "s"}`;
    renderThreatIncidentCount();
    if (!config.indicators.length) {
      const empty = document.createElement("p");
      empty.className = "aegisus-list-empty";
      empty.textContent = "Your local watchlist is empty. Add a domain, IPv4 address, or SHA-256 hash to check outgoing messages.";
      list.appendChild(empty);
      return;
    }
    config.indicators.forEach((indicator) => {
      const row = document.createElement("div");
      row.className = "aegisus-indicator-row";
      const details = document.createElement("div");
      details.className = "aegisus-indicator-details";
      const label = document.createElement("strong");
      label.textContent = indicator.label || indicator.type.toUpperCase();
      const value = document.createElement("code");
      value.textContent = indicator.value;
      const kind = document.createElement("span");
      kind.className = "aegisus-indicator-kind";
      kind.textContent = indicator.type === "sha256" ? "SHA-256" : indicator.type === "ipv4" ? "IPv4" : "DOMAIN";
      details.append(label, value, kind);

      const controls = document.createElement("div");
      controls.className = "aegisus-indicator-controls";
      const toggleLabel = document.createElement("label");
      toggleLabel.className = "aegisus-indicator-toggle";
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = indicator.enabled;
      toggle.setAttribute("aria-label", `${indicator.enabled ? "Disable" : "Enable"} ${indicator.label || indicator.value}`);
      toggle.addEventListener("change", () => updateIndicator(indicator.id, { enabled: toggle.checked }));
      toggleLabel.append(toggle, document.createTextNode("Active"));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-btn-sm aegisus-remove-indicator";
      remove.title = "Remove indicator";
      remove.setAttribute("aria-label", `Remove ${indicator.label || indicator.value}`);
      const icon = document.createElement("span");
      icon.className = "material-icons-outlined";
      icon.textContent = "delete_outline";
      remove.appendChild(icon);
      remove.addEventListener("click", () => removeIndicator(indicator.id));
      controls.append(toggleLabel, remove);
      row.append(details, controls);
      list.appendChild(row);
    });
  }

  const ARTICLES = [
    {
      id: "encryption",
      title: "What end-to-end encryption protects",
      category: "Messaging",
      summary: "Understand where message encryption begins and what it does not hide.",
      paragraphs: [
        "Halonyx encrypts message content on the sending client before it is sent through the relay. The relay handles encrypted payloads and delivery; it is not the place where message text is rendered.",
        "Encryption does not protect a device that is unlocked or compromised. People in a conversation can still copy, photograph, or forward messages, and connection or delivery metadata may remain visible to the service handling transport.",
      ],
      bullets: ["Keep devices and account credentials protected.", "Verify a contact’s identity when the conversation is sensitive.", "Treat message content as visible to its intended recipients."],
    },
    {
      id: "identity",
      title: "Verify a contact’s identity",
      category: "Identity",
      summary: "Use Safety Numbers to compare identity keys through a trusted channel.",
      paragraphs: [
        "Open the direct conversation’s security details and choose Verify Safety Numbers. Compare the displayed number with your contact using an independent trusted channel, such as in person.",
        "If the numbers do not match, stop and investigate before sharing sensitive information. A changed identity key may have an ordinary cause, but it should be confirmed with the contact.",
      ],
      bullets: ["Compare the complete number, not a short prefix.", "Use a channel independent from the conversation being verified.", "Re-verify after an identity-key change."],
    },
    {
      id: "dlp",
      title: "How DLP rules inspect drafts",
      category: "Aegisus",
      summary: "Client-side rules inspect outgoing text before encryption.",
      paragraphs: [
        "Aegisus DLP evaluates outgoing message text on this client before the message enters the encryption flow. The configured policy can block, ask for confirmation, or redact matching values.",
        "Detection is pattern-based and is not a guarantee that every secret will be found. Review the local audit log for recorded actions and use custom rules only when their patterns are understood.",
      ],
      bullets: ["Check recipients before sending sensitive content.", "Do not use an override when you are unsure why a rule matched.", "Avoid putting real credentials into test messages."],
    },
    {
      id: "watchlist",
      title: "Use the local threat watchlist",
      category: "Aegisus",
      summary: "Maintain indicators locally; this is not a live threat-reputation service.",
      paragraphs: [
        "The Threat Intelligence section matches message text against domains, IPv4 addresses, and SHA-256 hashes that you add. The list and alert history are stored in this browser’s local storage and are not uploaded as a feed.",
        "A match only means that text matched one of your saved indicators. It does not prove that a destination is malicious, and an indicator may be stale or entered incorrectly. Keep source and context for each indicator in its label.",
      ],
      bullets: ["Add only indicators from sources you trust.", "Review and remove outdated entries.", "Do not treat an empty watchlist as evidence that a link is safe."],
    },
    {
      id: "links",
      title: "Review links and remote content",
      category: "Safe browsing",
      summary: "Check the real destination before opening unfamiliar links.",
      paragraphs: [
        "Read the destination host carefully. Watch for misspellings, lookalike characters, unexpected subdomains, URL shorteners, and links that do not match the claimed sender or service.",
        "A familiar logo or display name does not authenticate a web page. Navigate to important services using a saved bookmark or a known address instead of an unexpected message link.",
      ],
      bullets: ["Do not enter passwords or recovery codes after following an unsolicited link.", "Never share a one-time code with someone who asks for it in chat.", "Treat files and links as untrusted even when sent by a known contact."],
    },
    {
      id: "local-data",
      title: "Understand local security data",
      category: "Privacy",
      summary: "Know what Aegisus keeps in this browser and what it does not do.",
      paragraphs: [
        "Threat watchlist entries, threat alert records, DLP preferences, and DLP audit records are stored locally by the client. Clearing browser storage can remove this information; it is not a synchronized team policy or central compliance system.",
        "Local checks reduce the need to disclose drafts to a remote scanning service, but they depend on this client and its local data. Keep the browser and operating system up to date and use the application’s documented threat model to understand its boundaries.",
      ],
      bullets: ["Do not assume local settings are shared with other devices.", "Review the application threat model before using it for high-risk communications.", "Aegisus indicators do not contact external threat feeds."],
    },
  ];

  let selectedArticleId = null;

  function renderArticle(article) {
    const reader = document.getElementById("aegisus-knowledge-article");
    if (!reader) return;
    reader.replaceChildren();
    const category = document.createElement("span");
    category.className = "aegisus-article-category";
    category.textContent = article.category;
    const title = document.createElement("h5");
    title.textContent = article.title;
    const summary = document.createElement("p");
    summary.className = "aegisus-article-summary";
    summary.textContent = article.summary;
    reader.append(category, title, summary);
    article.paragraphs.forEach((text) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      reader.appendChild(paragraph);
    });
    const list = document.createElement("ul");
    article.bullets.forEach((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      list.appendChild(item);
    });
    reader.appendChild(list);
  }

  function renderKnowledgeResults(query) {
    const results = document.getElementById("aegisus-knowledge-results");
    const reader = document.getElementById("aegisus-knowledge-article");
    if (!results || !reader) return;
    const search = String(query || "").trim().toLowerCase();
    const filtered = ARTICLES.filter((article) => !search || `${article.title} ${article.category} ${article.summary} ${article.paragraphs.join(" ")} ${article.bullets.join(" ")}`.toLowerCase().includes(search));
    results.replaceChildren();
    if (filtered.length === 0) {
      const empty = document.createElement("p");
      empty.className = "aegisus-list-empty";
      empty.textContent = "No guidance matches that search.";
      results.appendChild(empty);
      reader.replaceChildren();
      return;
    }
    if (!filtered.some((article) => article.id === selectedArticleId)) selectedArticleId = filtered[0].id;
    filtered.forEach((article) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `aegisus-knowledge-result${article.id === selectedArticleId ? " active" : ""}`;
      button.setAttribute("aria-current", article.id === selectedArticleId ? "true" : "false");
      const category = document.createElement("span");
      category.className = "aegisus-article-category";
      category.textContent = article.category;
      const title = document.createElement("strong");
      title.textContent = article.title;
      const summary = document.createElement("span");
      summary.textContent = article.summary;
      button.append(category, title, summary);
      button.addEventListener("click", () => {
        selectedArticleId = article.id;
        renderKnowledgeResults(document.getElementById("aegisus-knowledge-search")?.value);
      });
      results.appendChild(button);
    });
    const selected = filtered.find((article) => article.id === selectedArticleId) || filtered[0];
    selectedArticleId = selected.id;
    renderArticle(selected);
  }

  function initThreatUI() {
    const enabled = document.getElementById("aegisus-threat-enabled");
    const mode = document.getElementById("aegisus-threat-mode");
    const form = document.getElementById("aegisus-indicator-form");
    if (!enabled || !mode || !form) return;
    enabled.checked = config.enabled;
    mode.value = config.mode;
    const enabledState = document.getElementById("aegisus-threat-enabled-state");
    const syncEnabledState = () => {
      if (enabledState) enabledState.textContent = enabled.checked ? "On" : "Off";
      enabled.closest(".aegisus-inline-toggle")?.classList.toggle("is-disabled", !enabled.checked);
      enabled.setAttribute("aria-label", enabled.checked ? "Threat scanning is on" : "Threat scanning is off");
    };
    syncEnabledState();
    enabled.addEventListener("change", () => {
      setOptions({ enabled: enabled.checked });
      syncEnabledState();
    });
    mode.addEventListener("change", () => setOptions({ mode: mode.value }));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        const added = addIndicator(
          document.getElementById("aegisus-indicator-type").value,
          document.getElementById("aegisus-indicator-value").value,
          document.getElementById("aegisus-indicator-label").value,
        );
        document.getElementById("aegisus-indicator-value").value = "";
        document.getElementById("aegisus-indicator-label").value = "";
        setStatus(added.persisted
          ? "Indicator added to this browser’s local watchlist."
          : "Indicator is active for this session but could not be saved in browser storage.", !added.persisted);
        document.getElementById("aegisus-indicator-value").focus();
      } catch (error) {
        setStatus(error.message || "Could not add this indicator.", true);
      }
    });
    renderIndicatorList();
  }

  function initKnowledgeUI() {
    const search = document.getElementById("aegisus-knowledge-search");
    if (!search) return;
    search.addEventListener("input", () => renderKnowledgeResults(search.value));
    renderKnowledgeResults("");
  }

  function init() {
    initThreatUI();
    initKnowledgeUI();
  }

  root.HalonyxAegisus = {
    init,
    scan,
    getConfig,
    setOptions,
    addIndicator,
    updateIndicator,
    removeIndicator,
    getIncidents,
    logIncident,
    normalizeIndicator,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(typeof window !== "undefined" ? window : globalThis);
