import { fetchChatExplain } from "./backendClient.js";
import { prepareAssistantEvidence as prepareSafeEvidence } from "./assistantEvidence.js";

function getRiskLevel(verdict) {
  switch (verdict) {
    case "high_risk":
      return "High";
    case "risky":
      return "High";
    case "caution":
      return "Moderate";
    case "trusted":
      return "Low";
    default:
      return "Monitoring";
  }
}

function summarizeCategories(reasons = [], evidence = {}) {
  const categories = new Set();
  const text = reasons.join(" ").toLowerCase();

  if (/phish|brand|login|domain mismatch|spoof|impersonat/i.test(text)) categories.add("Phishing");
  if (/cookie|tracking|session|storage/i.test(text)) categories.add("Cookies");
  if (/download|file|malware|binary/i.test(text)) categories.add("Downloads");
  if (/extension|permission|sideload|management/i.test(text)) categories.add("Extensions");
  if (/form|password|credential/i.test(text)) categories.add("Form abuse");
  if (!categories.size) {
    categories.add("General website risk");
  }

  if (evidence?.signals?.hasPasswordField || evidence?.signals?.delayedPasswordField) {
    categories.add("Credential exposure");
  }

  return Array.from(categories).slice(0, 4);
}

function buildAdvancedAssessment(question, evidence = {}) {
  const prepared = prepareAssistantEvidence(evidence);
  const hostname = prepared.hostname || "this page";
  const verdict = prepared.verdict || "unknown";
  const reasons = prepared.reasons?.length ? prepared.reasons : ["Suspicious security signals were detected."];
  const primaryReason = reasons[0];
  const branded = Array.isArray(prepared.claimedBrands) && prepared.claimedBrands.length > 0
    ? prepared.claimedBrands.join(", ")
    : "";
  const normalizedQuestion = String(question ?? "").toLowerCase();
  const hasDirectRisk = /cross|domain mismatch|login|form|password|download|cookie|extension|malware|phish|brand/i.test(
    reasons.join(" "),
  );
  const riskLevel = getRiskLevel(verdict);
  const confidence = Math.min(98, Math.max(52, 68 + (reasons.length * 6) + (hasDirectRisk ? 8 : 0)));
  const categories = summarizeCategories(reasons, evidence);
  const recommendedActions = [
    "Do not enter credentials on this page until the domain is verified.",
    "Close the tab or use the browser safety prompt if the page appears deceptive.",
    "Review browser extensions and cookie permissions before continuing.",
  ];

  const generalRiskContext = `This page does not currently show a strong direct phishing or form-abuse signal, but websites can still be risky through fake login pages, brand impersonation, unsafe cookies, malicious downloads, password reuse, or over-permissioned browser extensions.`;

  let answer;

  if (/(what should i do|what now|advice)/.test(normalizedQuestion)) {
    if (verdict === "trusted" || !hasDirectRisk) {
      answer = `${generalRiskContext} For ${hostname}, verify the exact domain, avoid entering credentials when a page looks unexpected, and keep browser extensions limited to trusted software.`;
    } else {
      answer = `This page is considered ${verdict}. ${primaryReason} Do not enter credentials on ${hostname}. Verify the domain directly in your browser and close the page if you are unsure.`;
    }
  } else if (/(is this safe|safe\?)/.test(normalizedQuestion)) {
    if (verdict === "trusted" || !hasDirectRisk) {
      answer = `${generalRiskContext} A page may still be safe today but expose risk through phishing tricks, tracking, unsafe cookies, or malicious downloads. For ${hostname}, check the domain, confirm the site is expected, and never enter credentials on a page reached from a suspicious link.`;
    } else {
      answer = `This page is not considered safe. It is flagged as ${verdict} because: ${primaryReason} Do not enter sensitive information here.`;
    }
  } else if (/(why|because|risk|reason)/.test(normalizedQuestion)) {
    if (verdict === "trusted" || !hasDirectRisk) {
      answer = `${generalRiskContext} The main risks to watch for are phishing or fake login pages, cross-domain form submissions, cookie tracking, malicious downloads, and risky extensions. If a page asks for credentials, always verify it through the real brand site instead of clicking a search result or email link.`;
    } else {
      answer = `This page is considered ${verdict}. ${primaryReason}`;
      if (reasons.length > 1) {
        answer += ` Additional signals: ${reasons.slice(1).join("; ")}.`;
      }
    }
  } else if (/(domain|brand|url)/.test(normalizedQuestion)) {
    if (branded) {
      answer = `The page appears to claim ${branded}, but it is hosted on ${hostname}. A brand and domain mismatch is a strong phishing indicator.`;
    } else {
      answer = `The page is hosted on ${hostname}. Review the risk score and reasons before entering any credentials or personal information. Common website risks include fake login pages, malicious downloads, privacy leaks, and extension abuse.`;
    }
  } else if (/(login|form|password)/.test(normalizedQuestion)) {
    if (verdict === "trusted" || !hasDirectRisk) {
      answer = `${generalRiskContext} If a login page asks for a password, make sure the domain is exact and that the form is not posting to a different site or unexpectedly asking for credentials. Never reuse a password across multiple sites.`;
    } else {
      answer = `${primaryReason} If a password form submits to a different domain or uses insecure credentials, do not enter your password on ${hostname}.`;
    }
  } else {
    answer = `${generalRiskContext} If you are unsure, do not enter credentials on ${hostname}.`;
  }

  return {
    answer: answer.trim(),
    analysis: {
      riskLevel,
      confidence: Math.round(confidence),
      categories,
      recommendedActions,
      labels: {
        riskLevel: "Risk level",
        confidence: "Confidence",
        categories: "Threat categories",
        actions: "Recommended actions",
        privacySafe: "Privacy-safe",
      },
      evidenceSummary: `Privacy-safe analysis for ${hostname}. Sensitive values are redacted and no raw credentials or cookies are exposed.`,
      privacySafe: true,
    },
    evidence: prepared,
  };
}

export function prepareAssistantEvidence(evidence = {}) {
  return prepareSafeEvidence(evidence);
}

export function explainSecurityRiskLocally(question, evidence = {}) {
  const assessment = buildAdvancedAssessment(question, evidence);
  return {
    source: "local",
    ...assessment,
  };
}

export async function askSecurityAssistant(question, evidence = {}) {
  try {
    const response = await fetchChatExplain(question, evidence);
    if (response?.answer) {
      const baseAssessment = buildAdvancedAssessment(question, evidence);
      return {
        ...response,
        source: "backend",
        analysis: response.analysis ?? baseAssessment.analysis,
        answer: response.answer || baseAssessment.answer,
      };
    }
  } catch {
    // Fall back to the local rule-based explanation when the optional backend
    // service is unavailable or blocked.
  }

  return explainSecurityRiskLocally(question, evidence);
}
