/**
 * Halonyx Enterprise Data Loss Prevention (DLP) Engine
 * Reverse-engineered enterprise DLP pattern inspired by Rocket.Chat EE & Slack Enterprise Grid.
 * Enforces client-side pre-encryption inspection to prevent sensitive data leaks
 * without altering or compromising the underlying Signal Protocol E2EE layer.
 *
 * UMD: CommonJS & Browser compatible.
 */
(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HalonyxDLP = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STORAGE_KEY_CONFIG = "halonyx_dlp_config";
  const STORAGE_KEY_AUDIT = "halonyx_dlp_audit_log";

  /**
   * Luhn algorithm validation for credit card numbers.
   */
  function luhnCheck(cardStr) {
    if (!cardStr) return false;
    const digits = cardStr.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  /**
   * Generates a safe pseudo-UUID for audit log records.
   */
  function generateLogId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      try {
        return crypto.randomUUID();
      } catch (e) {}
    }
    return "dlp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Masks sensitive credentials to safely display in audit logs and UI alerts.
   */
  function maskSnippet(str) {
    if (!str) return "[EMPTY]";
    const s = String(str).trim();
    if (s.length <= 6) return "*".repeat(s.length);
    if (s.length <= 12) {
      return s.substring(0, 2) + "*".repeat(s.length - 4) + s.substring(s.length - 2);
    }
    return s.substring(0, 4) + "•".repeat(Math.min(s.length - 8, 12)) + s.substring(s.length - 4);
  }

  // Built-in Enterprise Rule Definitions
  const BUILTIN_RULES = [
    {
      id: "AWS_ACCESS_KEY",
      name: "AWS Access Key ID",
      category: "cloudKeys",
      categoryLabel: "Cloud & API Keys",
      severity: "high",
      description: "Amazon Web Services 20-character Access Key ID",
      regex: /\bAKIA[0-9A-Z]{16}\b/g,
    },
    {
      id: "AWS_SECRET_KEY",
      name: "AWS Secret Access Key",
      category: "cloudKeys",
      categoryLabel: "Cloud & API Keys",
      severity: "critical",
      description: "AWS secret credentials assignment",
      regex: /\b(?:aws_secret_access_key|aws_sec_key)[\s:=]+['"]?[A-Za-z0-9/+=]{40}['"]?\b/gi,
    },
    {
      id: "GITHUB_TOKEN",
      name: "GitHub Personal Token",
      category: "cloudKeys",
      categoryLabel: "Cloud & API Keys",
      severity: "high",
      description: "GitHub personal access token or OAuth token",
      regex: /\b(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82}|gho_[a-zA-Z0-9]{36})\b/g,
    },
    {
      id: "SLACK_TOKEN",
      name: "Slack API Token",
      category: "cloudKeys",
      categoryLabel: "Cloud & API Keys",
      severity: "high",
      description: "Slack Bot, User, or App token",
      regex: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/g,
    },
    {
      id: "OPENAI_KEY",
      name: "OpenAI API Key",
      category: "cloudKeys",
      categoryLabel: "Cloud & API Keys",
      severity: "high",
      description: "OpenAI secret API key",
      regex: /\bsk-[a-zA-Z0-9]{20,}\b/g,
    },
    {
      id: "PRIVATE_KEY",
      name: "Cryptographic Private Key",
      category: "cloudKeys",
      categoryLabel: "Cloud & API Keys",
      severity: "critical",
      description: "PEM/OpenSSH encoded private key header",
      regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    },
    {
      id: "JWT_TOKEN",
      name: "JWT Bearer Token",
      category: "cloudKeys",
      categoryLabel: "Cloud & API Keys",
      severity: "medium",
      description: "Raw JSON Web Token header and payload",
      regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    },
    {
      id: "CREDIT_CARD",
      name: "Payment Card Number",
      category: "paymentCards",
      categoryLabel: "Financial Data",
      severity: "high",
      description: "Visa, Mastercard, Amex, or Discover card validated via Luhn checksum",
      // Regex matches potential 13-19 digit card strings (allowing spaces or dashes)
      regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|2(?:22[1-9]|2[3-9][0-9]|[3-6][0-9]{2}|7[0-1][0-9]|720)[0-9]{12}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})(?:[\s-][0-9]{4})*\b/g,
      validate: function (match) {
        return luhnCheck(match);
      },
    },
    {
      id: "US_SSN",
      name: "US Social Security Number",
      category: "pii",
      categoryLabel: "PII & Personal Data",
      severity: "high",
      description: "US Social Security Number (format: XXX-XX-XXXX)",
      regex: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    },
    {
      id: "PLAINTEXT_SECRET",
      name: "Hardcoded Credential / Secret",
      category: "pii",
      categoryLabel: "PII & Personal Data",
      severity: "medium",
      description: "Inline plaintext credential assignment (password/api_key)",
      regex: /\b(?:password|passwd|api_key|client_secret)\s*[:=]\s*["']?\S{6,}["']?\b/gi,
    },
  ];

  // Default Configuration
  const DEFAULT_CONFIG = {
    enabled: true,
    mode: "BLOCK", // "BLOCK" | "WARN" | "REDACT"
    categories: {
      cloudKeys: true,
      paymentCards: true,
      pii: true,
    },
    customRules: [], // [{ id, name, pattern, severity, enabled }]
  };

  let inMemoryConfig = null;
  let inMemoryAuditLog = null;

  function loadConfig() {
    if (inMemoryConfig) return inMemoryConfig;
    if (typeof localStorage !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_CONFIG);
        if (stored) {
          inMemoryConfig = Object.assign({}, DEFAULT_CONFIG, JSON.parse(stored));
          return inMemoryConfig;
        }
      } catch (e) {
        console.warn("[DLP] Failed to read config from localStorage:", e);
      }
    }
    inMemoryConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    return inMemoryConfig;
  }

  function saveConfig(cfg) {
    inMemoryConfig = cfg;
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(cfg));
      } catch (e) {
        console.warn("[DLP] Failed to persist config to localStorage:", e);
      }
    }
    return inMemoryConfig;
  }

  function loadAuditLog() {
    if (inMemoryAuditLog) return inMemoryAuditLog;
    if (typeof localStorage !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_AUDIT);
        if (stored) {
          inMemoryAuditLog = JSON.parse(stored);
          if (Array.isArray(inMemoryAuditLog)) return inMemoryAuditLog;
        }
      } catch (e) {
        console.warn("[DLP] Failed to read audit log from localStorage:", e);
      }
    }
    inMemoryAuditLog = [];
    return inMemoryAuditLog;
  }

  function saveAuditLog(log) {
    // Keep last 100 entries to prevent unbounded storage
    const trimmed = log.slice(-100);
    inMemoryAuditLog = trimmed;
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_AUDIT, JSON.stringify(trimmed));
      } catch (e) {
        console.warn("[DLP] Failed to persist audit log:", e);
      }
    }
    return trimmed;
  }

  /**
   * Scans text against active DLP policies.
   *
   * @param {string} text - Message plaintext to inspect
   * @returns {Object} Scan results with violation details and redacted text
   */
  function scan(text) {
    const cfg = loadConfig();
    const result = {
      clean: true,
      hasViolation: false,
      enabled: cfg.enabled,
      mode: cfg.mode,
      violations: [],
      redactedText: String(text || ""),
    };

    if (!cfg.enabled || !text || typeof text !== "string") {
      return result;
    }

    let modifiedText = text;

    // Scan Built-in Rules
    for (const rule of BUILTIN_RULES) {
      if (!cfg.categories[rule.category]) {
        continue; // Category disabled
      }

      const regex = new RegExp(rule.regex.source, rule.regex.flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        const matchedStr = match[0];
        if (typeof rule.validate === "function" && !rule.validate(matchedStr)) {
          continue; // Rule validation rejected false positive (e.g., Luhn check)
        }

        const violation = {
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          categoryLabel: rule.categoryLabel,
          severity: rule.severity,
          matchedText: matchedStr,
          maskedSnippet: maskSnippet(matchedStr),
          index: match.index,
          description: rule.description,
        };

        result.violations.push(violation);
        result.hasViolation = true;
        result.clean = false;

        // Prepare auto-redacted replacement
        const redactionPlaceholder = `[REDACTED-DLP: ${rule.name}]`;
        modifiedText = modifiedText.replace(matchedStr, redactionPlaceholder);
      }
    }

    // Scan Custom User Rules
    if (Array.isArray(cfg.customRules)) {
      for (const custom of cfg.customRules) {
        if (!custom.enabled || !custom.pattern) continue;
        try {
          const customRegex = new RegExp(custom.pattern, "gi");
          let match;
          while ((match = customRegex.exec(text)) !== null) {
            const matchedStr = match[0];
            const violation = {
              ruleId: custom.id || "CUSTOM",
              ruleName: custom.name || "Custom Pattern",
              category: "custom",
              categoryLabel: "Custom Enterprise Rule",
              severity: custom.severity || "high",
              matchedText: matchedStr,
              maskedSnippet: maskSnippet(matchedStr),
              index: match.index,
              description: `Custom regex: /${custom.pattern}/`,
            };

            result.violations.push(violation);
            result.hasViolation = true;
            result.clean = false;

            const redactionPlaceholder = `[REDACTED-DLP: ${custom.name || "Custom"}]`;
            modifiedText = modifiedText.replace(matchedStr, redactionPlaceholder);
          }
        } catch (e) {
          console.warn("[DLP] Invalid custom regex pattern:", custom.pattern, e);
        }
      }
    }

    result.redactedText = modifiedText;
    return result;
  }

  /**
   * Logs an incident to the local audit log.
   */
  function logIncident(violations, action, context) {
    if (!violations || violations.length === 0) return;
    const log = loadAuditLog();

    violations.forEach((v) => {
      const entry = {
        id: generateLogId(),
        timestamp: new Date().toISOString(),
        ruleId: v.ruleId,
        ruleName: v.ruleName,
        category: v.category,
        categoryLabel: v.categoryLabel,
        severity: v.severity,
        action: action, // "BLOCKED" | "WARNED_SENT" | "WARNED_CANCELLED" | "AUTO_REDACTED"
        maskedSnippet: v.maskedSnippet,
        targetContext: context || "Chat",
      };
      log.push(entry);
    });

    saveAuditLog(log);
  }

  /**
   * Public API
   */
  return {
    scan,
    maskSnippet,
    luhnCheck,
    getConfig: () => JSON.parse(JSON.stringify(loadConfig())),
    updateConfig: (newCfg) => saveConfig(Object.assign({}, loadConfig(), newCfg)),
    resetConfig: () => saveConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIG))),
    getAuditLog: () => loadAuditLog().slice().reverse(),
    clearAuditLog: () => saveAuditLog([]),
    logIncident,
    exportAuditLogJSON: () => JSON.stringify(loadAuditLog(), null, 2),
    getBuiltinRules: () => BUILTIN_RULES.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      categoryLabel: r.categoryLabel,
      severity: r.severity,
      description: r.description,
    })),
  };
});
