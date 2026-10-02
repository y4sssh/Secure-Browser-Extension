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

function getEvidenceSignals(prepared = {}) {
  const signals = prepared?.signals ?? {};
  const score = Number(prepared?.scores?.finalTrustScore ?? 100);

  return {
    hasCredentialRisk: Boolean(
      signals.hasPasswordField ||
        signals.formPostsCrossDomain ||
        signals.formPostsCrossOrigin ||
        signals.insecurePasswordSubmit ||
        signals.hiddenPasswordField ||
        signals.loginOverlay ||
        signals.delayedPasswordField,
    ),
    hasBrandRisk: Boolean(signals.brandDomainMismatch || signals.redirectCount > 1 || /spoof|impersonat|brand/i.test(String(prepared?.reasons?.join(" ") ?? ""))),
    hasCookieRisk: Boolean(/cookie|tracking|session|storage/i.test(String(prepared?.reasons?.join(" ") ?? ""))),
    hasDownloadRisk: Boolean(/download|malware|file|binary|archive|script/i.test(String(prepared?.reasons?.join(" ") ?? ""))),
    hasExtensionRisk: Boolean(/extension|permission|management|sideload/i.test(String(prepared?.reasons?.join(" ") ?? ""))),
    score,
  };
}

function suggestActionsForSignals(signals, hostname, verdict) {
  const actions = new Set();

  if (signals.hasCredentialRisk) {
    actions.add(`Do not enter credentials on ${hostname} until the login form is verified and the domain matches the trusted brand.`);
    actions.add("Do not reuse or paste passwords into a page that asks for credentials in a suspicious or unexpected flow.");
  }

  if (signals.hasBrandRisk || verdict !== "trusted") {
    actions.add("Verify the exact domain by typing the brand URL manually instead of clicking a link or email prompt.");
  }

  if (signals.hasCookieRisk) {
    actions.add("Review cookie and tracking consent before continuing, and avoid allowing session persistence on untrusted pages.");
  }

  if (signals.hasDownloadRisk) {
    actions.add("Avoid downloading executables, archives, or scripts from this page unless you have independently verified the source.");
  }

  if (signals.hasExtensionRisk) {
    actions.add("Inspect browser extensions and remove anything that is unfamiliar, sideloaded, or asking for broad permissions.");
  }

  if (actions.size === 0) {
    actions.add("Keep the page in a verification workflow: confirm the exact domain, avoid entering credentials, and re-check with trusted sources.");
  }

  return Array.from(actions).slice(0, 4);
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
  const filteredReasonText = reasons.join(" ").replace(/no high-risk.*signals found/i, "").toLowerCase();
  const hasDirectRisk = /cross|domain mismatch|login|form|password|download|cookie|extension|malware|phish|brand/i.test(
    filteredReasonText,
  );
  const signalProfile = getEvidenceSignals(prepared);
  const categories = summarizeCategories(reasons, evidence);
  const categorySet = new Set(categories);

  if (signalProfile.hasCredentialRisk) categorySet.add("Credential exposure");
  if (signalProfile.hasBrandRisk) categorySet.add("Brand spoofing");
  if (signalProfile.hasCookieRisk) categorySet.add("Session tracking");
  if (signalProfile.hasDownloadRisk) categorySet.add("Malicious download vectors");
  if (signalProfile.hasExtensionRisk) categorySet.add("Extension abuse");

  const dynamicCategories = Array.from(categorySet).slice(0, 5);
  const confidenceBase = 52 + reasons.length * 6 + (hasDirectRisk ? 10 : 0) + (verdict === "high_risk" ? 8 : verdict === "risky" ? 6 : verdict === "caution" ? 3 : 0);
  const confidence = Math.min(98, Math.max(55, confidenceBase + (signalProfile.score < 60 ? 8 : 0)));
  const riskLevel = getRiskLevel(verdict);
  const recommendedActions = suggestActionsForSignals(signalProfile, hostname, verdict);

  const generalRiskContext = `This page is not a proof of active compromise, but it matches a risky profile with multiple security signals. The safest interpretation is to treat it as untrusted until the page has been verified through an independent, trusted route.`;

  let answer;

  if (/(what should i do|what now|advice)/.test(normalizedQuestion)) {
    if (verdict === "trusted" && !hasDirectRisk) {
      answer = `${generalRiskContext} For ${hostname}, verify the exact domain, avoid entering credentials when a page looks unexpected, and keep browser extensions limited to trusted software.`;
    } else {
      answer = `This page is considered ${verdict}. The strongest signals are ${reasons.slice(0, 2).join(" and ")}. Do not enter credentials on ${hostname}. Verify the domain directly in your browser and close the page if the URL or login flow looks unexpected.`;
    }
  } else if (/(is this safe|safe\?)/.test(normalizedQuestion)) {
    if (verdict === "trusted" && !hasDirectRisk) {
      answer = `${generalRiskContext} A page may still be safe today, but trust should be re-verified if it asks for a password, tries to redirect unexpectedly, or presents a brand mismatch. For ${hostname}, confirm the exact domain before entering any sensitive information.`;
    } else {
      answer = `This page is not considered safe. It is flagged as ${verdict} because ${primaryReason}. Avoid credentials, payment details, and session tokens until the domain has been confirmed independently.`;
    }
  } else if (/(why|because|risk|reason)/.test(normalizedQuestion)) {
    if (verdict === "trusted" && !hasDirectRisk) {
      answer = `${generalRiskContext} The main risks to watch for are phishing and fake login pages, cross-domain form submissions, cookie tracking, malicious downloads, risky extensions, and general tracking or consent abuse. Verify the domain directly and treat links from search results or email messages as untrusted until confirmed.`;
    } else {
      answer = `This page is considered ${verdict}. ${primaryReason}`;
      if (reasons.length > 1) {
        answer += ` Additional signals: ${reasons.slice(1).join("; ")}.`;
      }
      if (branded) {
        answer += ` The page appears to imitate ${branded}, which increases the phishing likelihood.`;
      }
    }
  } else if (/(domain|brand|url)/.test(normalizedQuestion)) {
    if (branded) {
      answer = `The page appears to claim ${branded}, but it is hosted on ${hostname}. A brand and domain mismatch is a strong phishing indicator, especially when the page asks for a password or other credentials.`;
    } else {
      answer = `The page is hosted on ${hostname}. Review the risk score and reasons before entering any credentials or personal information. Common website risks include fake login pages, malicious downloads, privacy leaks, and extension abuse.`;
    }
  } else if (/(login|form|password)/.test(normalizedQuestion)) {
    if (verdict === "trusted" && !hasDirectRisk) {
      answer = `${generalRiskContext} If a login page asks for a password, make sure the domain is exact and that the form is not posting to a different site or unexpectedly asking for credentials. Never reuse a password across multiple sites.`;
    } else {
      answer = `${primaryReason} If a password form submits to a different domain, uses a hidden field, or appears unexpectedly, do not enter your password on ${hostname}.`;
    }
  } else {
    answer = `${generalRiskContext} If you are unsure, do not enter credentials on ${hostname}. Review the page origin, risk categories, and action recommendations before continuing.`;
  }

  return {
    answer: answer.trim(),
    analysis: {
      riskLevel,
      confidence: Math.round(confidence),
      categories: dynamicCategories,
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
