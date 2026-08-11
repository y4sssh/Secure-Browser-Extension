import { Building2, ShieldAlert } from "lucide-react";

export function BrandGuardSummary({ evidence }) {
  const brandGuard = evidence?.brandGuard ?? {};
  const claimedBrand = brandGuard.claimedBrand || evidence?.signals?.claimedBrand || "";

  if (!claimedBrand) {
    return null;
  }

  const Icon = brandGuard.domainMismatch ? ShieldAlert : Building2;
  const expectedDomains = Array.isArray(brandGuard.expectedDomains) ? brandGuard.expectedDomains.slice(0, 3) : [];
  const brandRisk = evidence?.scores?.brandRisk ?? brandGuard.textRisk ?? 0;

  return (
    <section className={`brandguard-summary ${brandGuard.domainMismatch ? "brandguard-summary-warning" : ""}`}>
      <div className="section-title">
        <Icon size={16} aria-hidden="true" />
        <h2>BrandGuard</h2>
      </div>
      <dl>
        <div>
          <dt>Claimed brand</dt>
          <dd>{claimedBrand}</dd>
        </div>
        <div>
          <dt>Actual domain</dt>
          <dd>{brandGuard.actualDomain || evidence?.hostname || "Unknown"}</dd>
        </div>
        <div>
          <dt>Expected domain</dt>
          <dd>{expectedDomains.length > 0 ? expectedDomains.join(", ") : "Not matched"}</dd>
        </div>
        <div>
          <dt>Brand risk</dt>
          <dd>{formatRisk(brandRisk)}</dd>
        </div>
      </dl>
    </section>
  );
}

function formatRisk(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}
