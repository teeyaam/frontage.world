// Stripe payments seam. Two flows:
//   - Buyer payment: createPaymentIntent() backs the embedded Stripe
//     Elements card field on bookPage (routes/pages.js) — the buyer confirms
//     the charge client-side, then routes/api.js verifies the PaymentIntent
//     really succeeded before a booking is ever created (see
//     POST /api/bookings/create-intent and createBookingHandler).
//   - Seller payout: payout() fires a real Stripe Connect Transfer to the
//     seller's connected account once a job order reaches "installed" (see
//     releasePayoutForBooking in lib/db.js).
//
// Graceful degradation: if STRIPE_SECRET_KEY isn't set yet, both functions
// fall back to the original always-succeeds stub behavior, so the rest of
// the app (and local dev) stays testable before Stripe keys exist. Once the
// key is set, both talk to the real Stripe API — test-mode keys behave
// identically to live-mode keys from this code's point of view.

import Stripe from "stripe";

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let stripe = null;
if (isStripeConfigured()) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn("STRIPE_SECRET_KEY is not set — payments.js is running in stub mode (charges/payouts auto-succeed, no real money moves).");
}

function toCents(amount) {
  return Math.round(amount * 100);
}

// Creates a PaymentIntent for the buyer's lease payment. Returns the
// client_secret the embedded Stripe Element needs to confirm the charge,
// plus the PaymentIntent id so the server can later verify it succeeded.
export async function createPaymentIntent({ amount, currency = "aud", description, metadata = {} }) {
  if (!stripe) {
    // Stub mode — no real PaymentIntent exists. bookPage falls back to the
    // plaintext-card form in this case (see routes/pages.js) rather than
    // trying to mount a real Stripe Element against a fake client_secret.
    return { id: `pi_stub_${Date.now()}`, clientSecret: null, status: "requires_stub_confirmation" };
  }
  const intent = await stripe.paymentIntents.create({
    amount: toCents(amount),
    currency,
    description,
    metadata,
    automatic_payment_methods: { enabled: true },
  });
  return { id: intent.id, clientSecret: intent.client_secret, status: intent.status };
}

// Re-fetches a PaymentIntent from Stripe so the server never trusts a
// client-reported "it worked" — used by createBookingHandler before it
// ever calls db.createBookingBundle.
export async function retrievePaymentIntent(id) {
  if (!stripe) return { id, status: "succeeded", amount: null }; // stub mode
  const intent = await stripe.paymentIntents.retrieve(id);
  return { id: intent.id, status: intent.status, amount: intent.amount / 100, metadata: intent.metadata };
}

// Legacy stub-shaped charge — kept only for the stub-mode fallback path
// (Stripe not configured yet). Once Stripe is configured, the real charge
// happens client-side via createPaymentIntent + Stripe Elements instead;
// this is not called in that path.
export async function charge({ amount, currency = "AUD", description }) {
  return {
    status: "paid",
    paidAt: new Date().toISOString(),
  };
}

// Models the money actually leaving Frontage's Stripe balance for the
// seller — a real Connect Transfer once the seller has completed Connect
// Express onboarding (see /api/account/connect-payouts in routes/api.js),
// a stub before then. Called once, when a job order is marked installed
// (see releasePayoutForBooking in lib/db.js) — the buyer's charge lands
// with Frontage first and sits there ("held") until then.
export async function payout({ amount, destinationAccountId }) {
  if (!stripe) {
    return { status: "released", releasedAt: new Date().toISOString() };
  }
  if (!destinationAccountId) {
    // No Connect account on file for this seller yet — leave the payout
    // held rather than erroring; lib/db.js records why via
    // payoutBlockedReason.
    return { status: "blocked", releasedAt: null, transferId: null };
  }
  const transfer = await stripe.transfers.create({
    amount: toCents(amount),
    currency: "aud",
    destination: destinationAccountId,
  });
  return { status: "released", releasedAt: new Date().toISOString(), transferId: transfer.id };
}

// ---------------- Stripe Connect Express onboarding (seller payouts) ----------------
export async function createConnectAccount(email) {
  if (!stripe) throw new Error("Stripe is not configured — set STRIPE_SECRET_KEY first.");
  const account = await stripe.accounts.create({ type: "express", email, capabilities: { transfers: { requested: true } } });
  return account.id;
}

export async function createConnectOnboardingLink(accountId, { refreshUrl, returnUrl }) {
  if (!stripe) throw new Error("Stripe is not configured — set STRIPE_SECRET_KEY first.");
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

// ---------------- Webhook signature verification ----------------
export function constructWebhookEvent(rawBody, signature) {
  if (!stripe) throw new Error("Stripe is not configured — set STRIPE_SECRET_KEY first.");
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}
