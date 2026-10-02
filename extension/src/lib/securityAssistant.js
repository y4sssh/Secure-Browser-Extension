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

function getSeverityLevel(verdict, confidence) {
  if (verdict === "high_risk" || verdict === "risky") {
    return confidence >= 80 ? "Critical" : "High";
  }
  if (verdict === "caution") {
    return "Moderate";
  }
  if (verdict === "trusted") {
    return "Low";
  }
  return "Monitoring";
}

function rankThreatPriority(categories = [], signalProfile = {}) {
  const priorityMap = [
    { label: "Credential abuse", key: "Credential exposure", severity: "P1" },
    { label: "Brand impersonation", key: "Brand spoofing", severity: "P1" },
    { label: "Malicious delivery", key: "Malicious download vectors", severity: "P2" },
    { label: "Session tracking", key: "Session tracking", severity: "P2" },
    { label: "Extension abuse", key: "Extension abuse", severity: "P2" },
  ];

  const normalized = new Set(categories);
  const matched = priorityMap.filter((entry) => normalized.has(entry.key));

  if (matched.length) {
    return matched[0].severity;
  }

  if (signalProfile.hasCredentialRisk || signalProfile.hasBrandRisk) {
    return "P1";
  }
  if (signalProfile.hasDownloadRisk || signalProfile.hasCookieRisk || signalProfile.hasExtensionRisk) {
    return "P2";
  }
  return "P3";
}

function buildIncidentSummary(hostname, verdict, categories, signalProfile) {
  const topCategories = categories.slice(0, 3).join(", ");
  const severity = getSeverityLevel(verdict, signalProfile.score ?? 70);

  if (severity === "Critical" || severity === "High") {
    return `High-priority security incident on ${hostname}: a likely ${topCategories} pattern requires immediate user containment and verification.`;
  }

  if (severity === "Moderate") {
    return `Elevated risk on ${hostname}: the page shows a mixed ${topCategories} profile and should be treated as untrusted until verified.`;
  }

  return `Low to moderate risk on ${hostname}: no active compromise is proven, but the page still matches a broader website-risk pattern that requires caution.`;
}

function buildResponsePlaybooks(hostname, verdict, signalProfile) {
  const playbooks = [];

  if (signalProfile.hasCredentialRisk || verdict !== "trusted") {
    playbooks.push(`Containment: do not enter credentials on ${hostname}; close the tab and verify the destination through a known, trusted route.`);
  }

  if (signalProfile.hasBrandRisk) {
    playbooks.push("Brand protection: validate the exact domain manually and treat any impersonation or logo mismatch as a phishing indicator.");
  }

  if (signalProfile.hasCookieRisk) {
    playbooks.push("Privacy response: clear cookies for the current site, avoid accepting tracking consent, and review any active sessions before continuing.");
  }

  if (signalProfile.hasDownloadRisk) {
    playbooks.push("Download control: block executable, archive, or script downloads from this page and confirm source legitimacy before any install.");
  }

  if (signalProfile.hasExtensionRisk) {
    playbooks.push("Endpoint hygiene: review the browser extension list and remove anything unfamiliar or with excessive permissions that could enable persistence.");
  }

  if (!playbooks.length) {
    playbooks.push(`Monitoring: keep ${hostname} under review, avoid submitting credentials, and verify any unexpected redirects or brand changes before proceeding.`);
  }

  return playbooks.slice(0, 4);
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

function buildProfessionalRiskNarrative(hostname, verdict, reasons, branded, signalProfile) {
  const primarySignals = [];

  if (signalProfile.hasBrandRisk) primarySignals.push("brand spoofing or domain impersonation");
  if (signalProfile.hasCredentialRisk) primarySignals.push("credential harvesting or form abuse");
  if (signalProfile.hasCookieRisk) primarySignals.push("cookie and session tracking exposure");
  if (signalProfile.hasDownloadRisk) primarySignals.push("download or malware delivery behavior");
  if (signalProfile.hasExtensionRisk) primarySignals.push("extension or permission abuse");

  const narrative = primarySignals.length
    ? `The current evidence indicates a likely ${primarySignals.join(", ")}.`
    : "The current evidence suggests a broad website-risk posture rather than a single clear exploit.";

  const exposureSummary = `For ${hostname}, the assessment is ${verdict}. ${narrative} The browser review uses only sanitized indicators and does not expose raw credentials, cookies, or tokens.`;

  if (branded) {
    return `${exposureSummary} The page appears to imitate ${branded}, which materially increases phishing risk.`;
  }

  return exposureSummary;
}

function buildExecutiveSummary(hostname, verdict, severity, priority, categories) {
  const categoryText = categories.length ? categories.join(", ") : "general website risk";
  return `Executive summary: ${hostname} is currently assessed as ${verdict} with ${severity.toLowerCase()} severity and ${priority} priority. The observed pattern aligns to ${categoryText}, indicating a credible phishing or credential-abuse scenario requiring user containment.`;
}

function buildImpactAssessment(hostname, verdict, signalProfile, categories) {
  const impactBlocks = [];

  if (signalProfile.hasCredentialRisk) {
    impactBlocks.push("Credential impact: a user could expose login credentials, payment data, or session material if a password form is submitted or reused.");
  }

  if (signalProfile.hasBrandRisk) {
    impactBlocks.push("Brand impact: domain impersonation threatens trust, can drive password reuse, and raises the likelihood of successful phishing execution.");
  }

  if (signalProfile.hasCookieRisk) {
    impactBlocks.push("Privacy impact: tracking and session leakage may expose browsing patterns, persistent cookies, or authentication state.");
  }

  if (signalProfile.hasDownloadRisk) {
    impactBlocks.push("Malware impact: malicious files or scripts could establish persistence or deliver additional payloads.");
  }

  if (signalProfile.hasExtensionRisk) {
    impactBlocks.push("Endpoint impact: risky extension behavior can widen access to browser data or install unnecessary permissions.");
  }

  if (!impactBlocks.length) {
    impactBlocks.push(`Impact assessment: there is no confirmed active compromise on ${hostname}, but the page still reflects a broader ${categories[0] || "website risk"} posture that warrants caution.`);
  }

  return impactBlocks.join(" ");
}

function buildTriageWorkflow(hostname, verdict, signalProfile, recommendedActions) {
  const workflow = [
    `Triage workflow: isolate the session on ${hostname}, stop any credential entry, and verify the page through a trusted brand route before resuming any work.`,
    "Containment: close the tab or block access if the page requests credentials, banking data, or a login flow that does not match the known destination.",
  ];

  if (signalProfile.hasBrandRisk) {
    workflow.push("Verification: confirm the exact domain manually, compare the URL against the trusted brand, and treat any mismatch as a phishing indicator.");
  }

  if (recommendedActions.length) {
    workflow.push(`Operational follow-up: ${recommendedActions[0]}`);
  }

  workflow.push("Escalation: document the suspicious site, high-risk indicators, and any user impact before closing the investigation.");

  return workflow.join(" ");
}

function buildTicketNarrative(hostname, verdict, severity, priority, categories) {
  const categoryText = categories.length ? categories.join(" / ") : "general website risk";
  return `Ticket-ready narrative: An incident was opened for ${hostname} and classified as ${severity} severity with ${priority} urgency. The observed indicators align to ${categoryText} and the page was assessed as ${verdict}. The recommended response was to contain access, block credential entry, and verify the destination through an independent trusted source before allowing any user interaction.`;
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
  const severity = getSeverityLevel(verdict, confidence);
  const priority = rankThreatPriority(dynamicCategories, signalProfile);
  const recommendedActions = suggestActionsForSignals(signalProfile, hostname, verdict);
  const responsePlaybooks = buildResponsePlaybooks(hostname, verdict, signalProfile);
  const incidentSummary = buildIncidentSummary(hostname, verdict, dynamicCategories, signalProfile);
  const executiveSummary = buildExecutiveSummary(hostname, verdict, severity, priority, dynamicCategories);
  const impactAssessment = buildImpactAssessment(hostname, verdict, signalProfile, dynamicCategories);
  const triageWorkflow = buildTriageWorkflow(hostname, verdict, signalProfile, recommendedActions);
  const ticketNarrative = buildTicketNarrative(hostname, verdict, severity, priority, dynamicCategories);

  const generalRiskContext = `This page is not a proof of active compromise, but it matches a risky profile with multiple security signals. The safest interpretation is to treat it as untrusted until the page has been verified through an independent, trusted route.`;
  const professionalNarrative = buildProfessionalRiskNarrative(hostname, verdict, reasons, branded, signalProfile);

  let answer;

  if (/(what should i do|what now|advice)/.test(normalizedQuestion)) {
    if (verdict === "trusted" && !hasDirectRisk) {
      answer = `${professionalNarrative} For ${hostname}, verify the exact domain, avoid entering credentials when a page looks unexpected, and keep browser extensions limited to trusted software.`;
    } else {
      answer = `${professionalNarrative} The strongest signals are ${reasons.slice(0, 2).join(" and ")}. Take immediate containment: do not enter credentials on ${hostname}, verify the domain directly in your browser, and close the page if the URL or login flow looks unexpected.`;
    }
  } else if (/(is this safe|safe\?)/.test(normalizedQuestion)) {
    if (verdict === "trusted" && !hasDirectRisk) {
      answer = `${professionalNarrative} A page may still be safe today, but trust should be re-verified if it asks for a password, tries to redirect unexpectedly, or presents a brand mismatch. For ${hostname}, confirm the exact domain before entering any sensitive information.`;
    } else {
      answer = `${professionalNarrative} This page should be treated as unsafe for credential entry, payment details, or session tokens until the domain has been confirmed independently.`;
    }
  } else if (/(why|because|risk|reason)/.test(normalizedQuestion)) {
    if (verdict === "trusted" && !hasDirectRisk) {
      answer = `${professionalNarrative} The main risks to watch for are phishing and fake login pages, cross-domain form submissions, cookie tracking, malicious downloads, risky extensions, and general tracking or consent abuse. Verify the domain directly and treat links from search results or email messages as untrusted until confirmed.`;
    } else {
      answer = `${professionalNarrative} ${primaryReason}`;
      if (reasons.length > 1) {
        answer += ` Additional signals: ${reasons.slice(1).join("; ")}.`;
      }
      if (branded) {
        answer += ` The page appears to imitate ${branded}, which materially increases the phishing likelihood.`;
      }
    }
  } else if (/(domain|brand|url)/.test(normalizedQuestion)) {
    if (branded) {
      answer = `${professionalNarrative} The page appears to claim ${branded}, but it is hosted on ${hostname}. A brand and domain mismatch is a strong phishing indicator, especially when the page asks for a password or other credentials.`;
    } else {
      answer = `${professionalNarrative} The page is hosted on ${hostname}. Review the risk score and reasons before entering any credentials or personal information. Common website risks include fake login pages, malicious downloads, privacy leaks, and extension abuse.`;
    }
  } else if (/(login|form|password)/.test(normalizedQuestion)) {
    if (verdict === "trusted" && !hasDirectRisk) {
      answer = `${generalRiskContext} If a login page asks for a password, make sure the domain is exact and that the form is not posting to a different site or unexpectedly asking for credentials. Never reuse a password across multiple sites.`;
    } else {
      answer = `${professionalNarrative} ${primaryReason} If a password form submits to a different domain, uses a hidden field, or appears unexpectedly, do not enter your password on ${hostname}.`;
    }
  } else {
    answer = `${professionalNarrative} If you are unsure, do not enter credentials on ${hostname}. Review the page origin, risk categories, and action recommendations before continuing.`;
  }

  return {
    answer: answer.trim(),
    analysis: {
      riskLevel,
      severity,
      priority,
      confidence: Math.round(confidence),
      categories: dynamicCategories,
      recommendedActions,
      responsePlaybooks,
      incidentSummary,
      executiveSummary,
      impactAssessment,
      triageWorkflow,
      ticketNarrative,
      labels: {
        riskLevel: "Risk level",
        confidence: "Confidence",
        categories: "Threat categories",
        actions: "Recommended actions",
        severity: "Incident severity",
        priority: "Threat priority",
        playbooks: "Response playbooks",
        executiveSummary: "Executive summary",
        impactAssessment: "Impact assessment",
        triageWorkflow: "Triage workflow",
        ticketNarrative: "Ticket-ready narrative",
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
