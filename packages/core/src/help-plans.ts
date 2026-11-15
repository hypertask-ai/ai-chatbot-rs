export const PRICING_ARTICLE_SLUG = "pricing-plans";

export const SIGNUP_URL = "https://app.hypertask.ai/login";

export const SALES_EMAIL = "help@hypertask.ai";

export const PAID_SEAT_CAP = 50;

export const TRIAL_DAYS = 14;

export const YEARLY_SAVE_PERCENT = 20;

export const FREE_BOARD_CAP = 3;

export type HelpPlanId = "byok" | "free" | "pro";

export interface HelpSeatRate {
  readonly monthlyPerSeatUsd: number;
  readonly yearlyPerSeatUsd: number;
  readonly yearlyTotalPerSeatUsd: number;
}

export interface HelpPlan {
  readonly audience: string;
  readonly cta: string;
  readonly id: HelpPlanId;
  readonly monthlyPerSeatUsd: number;
  readonly name: string;
  readonly points: readonly string[];
}

export const helpPlans: readonly HelpPlan[] = [
  {
    audience: "For teams getting started at no cost.",
    cta: "Start free",
    id: "free",
    monthlyPerSeatUsd: 0,
    name: "Free",
    points: [
      "Unlimited members",
      "Unlimited open tickets",
      `Own up to ${String(FREE_BOARD_CAP)} boards (archived boards do not count)`,
      "Small starter AI allowance",
    ],
  },
  {
    audience: "For teams that bring their own AI keys.",
    cta: `Start ${String(TRIAL_DAYS)}-day trial`,
    id: "byok",
    monthlyPerSeatUsd: 10,
    name: "BYOK",
    points: [
      "Use your own AI keys",
      "Email support",
      `${String(TRIAL_DAYS)}-day trial`,
    ],
  },
  {
    audience: "For teams that want managed AI, with no keys.",
    cta: `Start ${String(TRIAL_DAYS)}-day trial`,
    id: "pro",
    monthlyPerSeatUsd: 20,
    name: "Pro",
    points: [
      "Managed AI models, no keys to manage",
      "Integrations",
      "Priority support",
      `${String(TRIAL_DAYS)}-day trial`,
    ],
  },
];

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const dollars = (amount: number): string => `$${String(amount)}`;

export const helpSeatRate = (monthlyPerSeatUsd: number): HelpSeatRate => {
  const yearlyPerSeatUsd = Math.round(
    (monthlyPerSeatUsd * (100 - YEARLY_SAVE_PERCENT)) / 100
  );

  return {
    monthlyPerSeatUsd,
    yearlyPerSeatUsd,
    yearlyTotalPerSeatUsd: yearlyPerSeatUsd * 12,
  };
};

const planCard = (plan: HelpPlan): string => {
  const rate = helpSeatRate(plan.monthlyPerSeatUsd);

  const points = plan.points
    .map((point) => `<li>${escapeHtml(point)}</li>`)
    .join("");

  const price =
    plan.id === "free"
      ? `<p class="plan-price"><span class="plan-amount">${dollars(0)}</span><span class="plan-unit">per seat, forever</span></p><p class="plan-detail">Free on monthly or yearly billing</p>`
      : `<p class="plan-price"><span class="plan-amount price-yearly">${dollars(rate.yearlyPerSeatUsd)}</span><span class="plan-amount price-monthly">${dollars(rate.monthlyPerSeatUsd)}</span><span class="plan-unit">per seat / month</span></p>
        <p class="plan-detail price-yearly">${dollars(rate.yearlyTotalPerSeatUsd)} per seat, billed yearly</p>
        <p class="plan-detail price-monthly">Billed every month</p>
        <p class="plan-alt price-yearly">or ${dollars(rate.monthlyPerSeatUsd)}/seat/month billed monthly</p>
        <p class="plan-alt price-monthly">or ${dollars(rate.yearlyPerSeatUsd)}/seat/month billed yearly (${dollars(rate.yearlyTotalPerSeatUsd)}/yr)</p>`;

  return `<article class="plan-card" data-plan="${plan.id}" data-monthly="${String(rate.monthlyPerSeatUsd)}" data-yearly="${String(rate.yearlyPerSeatUsd)}" data-year-total="${String(rate.yearlyTotalPerSeatUsd)}">
      <h2 class="plan-name">${escapeHtml(plan.name)}</h2>
      <p class="plan-who">${escapeHtml(plan.audience)}</p>
      ${price}
      <ul class="plan-points">${points}</ul>
      <a class="plan-cta" href="${escapeHtml(SIGNUP_URL)}">${escapeHtml(plan.cta)}</a>
    </article>`;
};

const planCss = `
.plan-board { margin: 8px 0 28px; color: var(--ink, #f4f4f7); container-type: inline-size; }
.plan-board * { box-sizing: border-box; }
.plan-toggle {
  position: relative;
  display: flex;
  width: fit-content;
  max-width: 100%;
  gap: 4px;
  padding: 4px;
  margin-bottom: 16px;
  background: var(--surface, #0b0b0d);
  border: 1px solid var(--surface-border, rgba(255,255,255,0.14));
  border-radius: 10px;
}
.plan-billing-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: 0;
}
.plan-toggle label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 14px;
  border-radius: 8px;
  color: var(--muted, #a7a8ad);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.plan-billing-input:checked + label {
  background: var(--btn-bg, #ffffff);
  color: var(--btn-fg, #000000);
}
.plan-billing-input:focus-visible + label { outline: 2px solid var(--ink, #f4f4f7); outline-offset: 2px; }
.plan-save { font-size: 12px; font-weight: 700; }
.plan-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.plan-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 18px 16px 16px;
  background: var(--surface, #0b0b0d);
  border: 1px solid var(--surface-border, rgba(255,255,255,0.14));
  border-radius: var(--radius-lg, 14px);
}
.plan-name {
  font-family: var(--font-display, Georgia, serif);
  font-size: 26px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.plan-who { margin: 8px 0 14px; color: var(--muted, #a7a8ad); font-size: 14px; line-height: 1.4; }
.plan-price { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; margin: 0; }
.plan-amount { font-size: 32px; font-weight: 650; letter-spacing: -0.03em; line-height: 1; }
.plan-unit, .plan-detail, .plan-alt { color: var(--muted, #a7a8ad); font-size: 13px; line-height: 1.4; }
.plan-detail, .plan-alt { margin: 4px 0 0; }
.plan-points { list-style: none; margin: 16px 0; padding: 0; flex: 1; }
.plan-points li { position: relative; margin: 0 0 8px; padding-left: 16px; font-size: 14px; line-height: 1.4; }
.plan-points li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.5em;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink, #f4f4f7);
}
.plan-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 40px;
  padding: 8px 14px;
  background: var(--btn-bg, #ffffff);
  color: var(--btn-fg, #000000);
  border-radius: var(--radius-btn, 8px);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}
.plan-cta:hover { background: var(--primary-hover, #d9d9d9); }
.plan-note { margin: 14px 0 0; color: var(--muted, #a7a8ad); font-size: 14px; line-height: 1.5; }
.plan-note a { color: var(--ink, #f4f4f7); white-space: nowrap; }
.plan-board .price-monthly { display: none; }
.plan-board:has(#ht-plan-monthly:checked) .price-yearly { display: none; }
.plan-board:has(#ht-plan-monthly:checked) .price-monthly { display: block; }
.plan-board:has(#ht-plan-monthly:checked) .plan-price .price-monthly { display: inline; }
@container (max-width: 640px) {
  .plan-grid { grid-template-columns: 1fr; }
  .plan-toggle { width: 100%; }
  .plan-toggle label { flex: 1; }
}
`;

export const helpPlansHtml = (slug: string): string => {
  if (slug !== PRICING_ARTICLE_SLUG) {
    return "";
  }

  const cards = helpPlans.map(planCard).join("");
  const note = `Paid plans include a ${String(TRIAL_DAYS)}-day trial and are offered for up to ${String(PAID_SEAT_CAP)} seats. For more than ${String(PAID_SEAT_CAP)} seats, email <a href="mailto:${escapeHtml(SALES_EMAIL)}">${escapeHtml(SALES_EMAIL)}</a>.`;

  return `<section class="plan-board" aria-label="Hypertask plans">
    <style>${planCss}</style>
    <div class="plan-toggle" role="radiogroup" aria-label="Billing period">
      <input class="plan-billing-input" type="radio" name="ht-plan-billing" id="ht-plan-monthly">
      <label for="ht-plan-monthly">Monthly</label>
      <input class="plan-billing-input" type="radio" name="ht-plan-billing" id="ht-plan-yearly" checked>
      <label for="ht-plan-yearly">Yearly <span class="plan-save">save ${String(YEARLY_SAVE_PERCENT)}%</span></label>
    </div>
    <div class="plan-grid">${cards}</div>
    <p class="plan-note">${note}</p>
  </section>`;
};
