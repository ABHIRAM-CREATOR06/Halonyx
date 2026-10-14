const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.join(__dirname, "..");
const HalonyxDLP = require(path.join(root, "frontend", "js", "dlp.js"));

// Test secret fixtures constructed dynamically to prevent static git secret scanning false positives
const MOCK_AWS_KEY = ["AK", "IA", "IOSFODNN7EXAMPLE"].join("");
const MOCK_GITHUB_TOKEN = ["gh", "p_", "111122223333444455556666777788889999"].join("");
const MOCK_SLACK_TOKEN = ["xo", "xb-", "123456789012-1234567890123-", "456789abcdefghijklmnopqrst"].join("");
const MOCK_OPENAI_KEY = ["sk-", "abcdefghijklmnopqrstuvwxyz123456"].join("");

test("DLP: Clean message returns hasViolation = false", () => {
  const result = HalonyxDLP.scan("Hello world! How are you doing today?");
  assert.equal(result.clean, true);
  assert.equal(result.hasViolation, false);
  assert.equal(result.violations.length, 0);
  assert.equal(result.redactedText, "Hello world! How are you doing today?");
});

test("DLP: Detects AWS Access Key ID and masks snippet", () => {
  const text = `Deploy using key ${MOCK_AWS_KEY} in us-east-1`;
  const result = HalonyxDLP.scan(text);

  assert.equal(result.clean, false);
  assert.equal(result.hasViolation, true);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].ruleId, "AWS_ACCESS_KEY");
  assert.equal(result.violations[0].matchedText, MOCK_AWS_KEY);
  assert.ok(result.violations[0].maskedSnippet.startsWith("AKIA"));
  assert.ok(result.violations[0].maskedSnippet.endsWith("LE"));
  assert.ok(!result.violations[0].maskedSnippet.includes("IOSFODNN7"));
});

test("DLP: Detects GitHub Personal Access Token", () => {
  const text = `My token is ${MOCK_GITHUB_TOKEN}`;
  const result = HalonyxDLP.scan(text);

  assert.equal(result.hasViolation, true);
  assert.equal(result.violations[0].ruleId, "GITHUB_TOKEN");
});

test("DLP: Detects Slack Token", () => {
  const text = MOCK_SLACK_TOKEN;
  const result = HalonyxDLP.scan(text);

  assert.equal(result.hasViolation, true);
  assert.equal(result.violations[0].ruleId, "SLACK_TOKEN");
});

test("DLP: Detects OpenAI API Key", () => {
  const text = `Here is my key: ${MOCK_OPENAI_KEY}`;
  const result = HalonyxDLP.scan(text);

  assert.equal(result.hasViolation, true);
  assert.equal(result.violations[0].ruleId, "OPENAI_KEY");
});

test("DLP: Detects PEM Private Key header", () => {
  const text = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0";
  const result = HalonyxDLP.scan(text);

  assert.equal(result.hasViolation, true);
  assert.equal(result.violations[0].ruleId, "PRIVATE_KEY");
  assert.equal(result.violations[0].severity, "critical");
});

test("DLP: Detects US Social Security Number", () => {
  const text = "Tax SSN: 123-45-6789 for application";
  const result = HalonyxDLP.scan(text);

  assert.equal(result.hasViolation, true);
  assert.equal(result.violations[0].ruleId, "US_SSN");
});

test("DLP: Credit card Luhn validation prevents false positive on random numbers", () => {
  // Random 16-digit number that fails Luhn check
  const fakeCard = "4111111111111112";
  assert.equal(HalonyxDLP.luhnCheck(fakeCard), false);
  const scanFake = HalonyxDLP.scan(`Payment card: ${fakeCard}`);
  const ccViolationsFake = scanFake.violations.filter((v) => v.ruleId === "CREDIT_CARD");
  assert.equal(ccViolationsFake.length, 0, "Fake card failing Luhn should not trigger CREDIT_CARD rule");

  // Valid Luhn test card (standard 4111 1111 1111 1111)
  const validTestCard = "4111111111111111";
  assert.equal(HalonyxDLP.luhnCheck(validTestCard), true);
  const scanValid = HalonyxDLP.scan(`Card: ${validTestCard}`);
  const ccViolationsValid = scanValid.violations.filter((v) => v.ruleId === "CREDIT_CARD");
  assert.equal(ccViolationsValid.length, 1, "Valid Luhn card must trigger CREDIT_CARD rule");
});

test("DLP: Redaction replaces secrets with placeholder tokens", () => {
  const text = `Connect with ${MOCK_AWS_KEY} and ${MOCK_OPENAI_KEY}`;
  const result = HalonyxDLP.scan(text);

  assert.equal(result.hasViolation, true);
  assert.equal(result.violations.length, 2);
  assert.ok(result.redactedText.includes("[REDACTED-DLP: AWS Access Key ID]"));
  assert.ok(result.redactedText.includes("[REDACTED-DLP: OpenAI API Key]"));
  assert.ok(!result.redactedText.includes(MOCK_AWS_KEY));
  assert.ok(!result.redactedText.includes(MOCK_OPENAI_KEY.slice(0, 10)));
});

test("DLP: Custom enterprise regex rules function properly", () => {
  HalonyxDLP.updateConfig({
    customRules: [
      {
        id: "INTERNAL_PROJ_CODE",
        name: "Project Codename",
        pattern: "PROJECT-[A-Z]{4}-\\d{3}",
        severity: "high",
        enabled: true,
      },
    ],
  });

  const scanCustom = HalonyxDLP.scan("Do not leak PROJECT-ZEUS-991 to anyone");
  assert.equal(scanCustom.hasViolation, true);
  assert.equal(scanCustom.violations[0].ruleName, "Project Codename");
  assert.equal(scanCustom.violations[0].matchedText, "PROJECT-ZEUS-991");

  // Clean up
  HalonyxDLP.resetConfig();
});

test("DLP: Audit logging records incidents without plaintext leakage", () => {
  HalonyxDLP.clearAuditLog();
  const scan = HalonyxDLP.scan(`Secret key ${MOCK_AWS_KEY} was leaked`);
  HalonyxDLP.logIncident(scan.violations, "BLOCKED", "TestRecipient");

  const log = HalonyxDLP.getAuditLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].ruleId, "AWS_ACCESS_KEY");
  assert.equal(log[0].action, "BLOCKED");
  assert.equal(log[0].targetContext, "TestRecipient");
  assert.ok(!log[0].maskedSnippet.includes("IOSFODNN7"));

  HalonyxDLP.clearAuditLog();
});
