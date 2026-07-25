/**
 * Email Utilities for Halonyx
 * Generates client-side email subjects, body contents, mailto URIs, and webmail links
 * without relying on any backend server or third-party mailing service.
 */
(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EmailUtils = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /**
   * Constructs formatted subject and body for sharing a USID code.
   * @param {string} usid - Cryptographic USID string
   * @param {string} [senderName=''] - Sender's display name
   * @returns {{ subject: string, body: string }}
   */
  function buildUsidEmailContent(usid, senderName = "") {
    const cleanUsid = (usid || "").trim();
    const fromText = senderName && senderName.trim() ? ` from ${senderName.trim()}` : "";
    const subject = `Halonyx USID Identity Code${fromText}`;

    const body = `Hello,

Here is my Halonyx USID identity code to connect securely:

USID:
${cleanUsid}

How to use this code:
1. Open Halonyx App.
2. Click 'Add Contact' (+).
3. Paste the USID code above to establish an end-to-end encrypted channel.

--
Sent via Halonyx Secure Messaging (Client-Side Direct Mail)`;

    return { subject, body };
  }

  /**
   * Builds mailto: URI for native desktop or mobile email apps.
   * @param {string} usid - USID code
   * @param {string} [recipientEmail=''] - Optional recipient email address
   * @param {string} [senderName=''] - Optional sender name
   * @returns {string} mailto URI
   */
  function buildMailtoUrl(usid, recipientEmail = "", senderName = "") {
    const { subject, body } = buildUsidEmailContent(usid, senderName);
    const cleanRecipient = (recipientEmail || "").trim();
    return `mailto:${encodeURIComponent(cleanRecipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  /**
   * Builds webmail compose URLs for Gmail, Outlook, Yahoo Mail.
   * @param {string} usid - USID code
   * @param {string} [recipientEmail=''] - Optional recipient email address
   * @param {string} [senderName=''] - Optional sender name
   * @returns {{ gmail: string, outlook: string, yahoo: string }}
   */
  function buildWebmailUrls(usid, recipientEmail = "", senderName = "") {
    const { subject, body } = buildUsidEmailContent(usid, senderName);
    const cleanRecipient = (recipientEmail || "").trim();
    const encRecipient = encodeURIComponent(cleanRecipient);
    const encSubject = encodeURIComponent(subject);
    const encBody = encodeURIComponent(body);

    return {
      gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${encRecipient}&su=${encSubject}&body=${encBody}`,
      outlook: `https://outlook.office.com/mail/deeplink/compose?to=${encRecipient}&subject=${encSubject}&body=${encBody}`,
      yahoo: `https://compose.mail.yahoo.com/?to=${encRecipient}&subject=${encSubject}&body=${encBody}`,
    };
  }

  return {
    buildUsidEmailContent,
    buildMailtoUrl,
    buildWebmailUrls,
  };
});
