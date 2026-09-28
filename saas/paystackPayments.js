const crypto = require("crypto");

const PLANS = Object.freeze({
    7: Object.freeze({ days: 7, amount: 29 }),
    14: Object.freeze({ days: 14, amount: 49 }),
    30: Object.freeze({ days: 30, amount: 99 }),
});
const PAYSTACK_API = "https://api.paystack.co";

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function normalizePhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!/^254[17]\d{8}$/.test(digits)) {
        throw httpError(400, "Enter a Kenyan M-PESA number with country code, for example +254712345678.");
    }
    return digits;
}

function normalizeEmail(value) {
    const email = String(value || "").trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw httpError(400, "Enter a valid email address for the Paystack receipt.");
    }
    return email;
}

function parseMetadata(value) {
    if (value && typeof value === "object") return value;
    if (typeof value !== "string") return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function verifyWebhookSignature(rawBody, signature, secret) {
    if (!Buffer.isBuffer(rawBody) || typeof signature !== "string" || !secret) return false;
    const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
    const supplied = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    return supplied.length === expectedBuffer.length && crypto.timingSafeEqual(supplied, expectedBuffer);
}

function createPaystackService({
    tokenRegistry,
    fetchImpl = globalThis.fetch,
    getSecret = () => process.env.PAYSTACK_SECRET_KEY,
    isEnabled = () => String(process.env.PAYSTACK_ENABLED || "false").toLowerCase() === "true",
} = {}) {
    if (!tokenRegistry) throw new TypeError("tokenRegistry is required");
    if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");

    function requireSecret() {
        if (!getSecret()) {
            throw httpError(503, "Paystack payments are not configured. Please try again later.");
        }
        return getSecret();
    }

    function requireEnabled() {
        const secret = requireSecret();
        if (!isEnabled()) throw httpError(503, "Paystack payments are not configured. Please try again later.");
        return secret;
    }

    async function paystackRequest(path, { method = "GET", body } = {}) {
        const secret = requireSecret();
        let response;
        try {
            response = await fetchImpl(`${PAYSTACK_API}${path}`, {
                method,
                headers: {
                    Authorization: `Bearer ${secret}`,
                    "Content-Type": "application/json",
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
                signal: AbortSignal.timeout(15000),
            });
        } catch {
            throw httpError(502, "Could not reach Paystack. Please retry shortly.");
        }
        const result = await response.json().catch(() => null);
        if (!response.ok || !result || result.status !== true) {
            throw httpError(502, "Paystack could not process the request. Please retry or contact support.");
        }
        return result.data;
    }

    async function initializeCharge({ phone: phoneInput, email: emailInput, days: daysInput }) {
        requireEnabled();
        const phone = normalizePhone(phoneInput);
        const email = normalizeEmail(emailInput);
        const days = Number(daysInput);
        const plan = PLANS[days];
        if (!plan) throw httpError(400, "Select one of the available access plans.");

        if (typeof tokenRegistry.canPurchase === "function") {
            const eligibility = await tokenRegistry.canPurchase(phone);
            if (!eligibility.allowed) throw httpError(409, eligibility.message);
        }

        // References are server-generated and restricted to Paystack's documented
        // alphanumeric/hyphen character set.
        const reference = `fb-${crypto.randomBytes(16).toString("hex")}`;
        const metadata = {
            application: "firebox-bot",
            plan_days: plan.days,
            plan_amount_kes: plan.amount,
            phone,
            email,
        };
        const charge = await paystackRequest("/charge", {
            method: "POST",
            body: {
                email,
                amount: plan.amount * 100,
                currency: "KES",
                reference,
                mobile_money: { phone: `+${phone}`, provider: "mpesa" },
                metadata,
            },
        });
        if (!charge || charge.reference !== reference) {
            throw httpError(502, "Paystack returned an unexpected payment reference. No token was issued.");
        }
        return {
            reference,
            status: String(charge.status || "pending"),
            displayText: String(charge.display_text || "Approve the M-PESA prompt on your phone, then check payment status."),
            message: "M-PESA payment request sent.",
        };
    }

    async function verifyAndGrant(referenceInput) {
        requireSecret();
        const reference = String(referenceInput || "").trim();
        if (!/^fb-[a-f0-9]{32}$/.test(reference)) throw httpError(400, "Invalid Paystack payment reference.");

        const transaction = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
        if (!transaction || transaction.reference !== reference) {
            throw httpError(400, "Paystack transaction reference did not match.");
        }

        const metadata = parseMetadata(transaction.metadata);
        const days = Number(metadata && metadata.plan_days);
        const plan = PLANS[days];
        const phone = metadata && String(metadata.phone || "");
        const email = metadata && String(metadata.email || "").trim().toLowerCase();
        const customerEmail = String(transaction.customer && transaction.customer.email || "").trim().toLowerCase();
        if (!metadata || metadata.application !== "firebox-bot" || !plan ||
            Number(metadata.plan_amount_kes) !== plan.amount ||
            !/^254[17]\d{8}$/.test(phone) || !email || customerEmail !== email ||
            Number(transaction.amount) !== plan.amount * 100 || transaction.currency !== "KES" ||
            transaction.channel !== "mobile_money") {
            throw httpError(400, "Verified Paystack transaction does not match a Firebox access plan.");
        }

        if (transaction.status !== "success") {
            const status = ["pending", "ongoing", "processing"].includes(String(transaction.status).toLowerCase())
                ? "pending" : "failed";
            return {
                status,
                reference,
                days: plan.days,
                message: status === "pending"
                    ? "Payment is still awaiting M-PESA approval. Approve the prompt and check again shortly."
                    : "Paystack has not confirmed a successful payment. No token was issued.",
            };
        }

        const entitlement = await tokenRegistry.applyPaidPlan({ phone, days: plan.days, reference });
        return {
            status: "success",
            reference,
            days: plan.days,
            token: entitlement.token,
            expiresAt: entitlement.expiresAt,
        };
    }

    async function handleWebhook({ rawBody, signature }) {
        const secret = requireSecret();
        if (!verifyWebhookSignature(rawBody, signature, secret)) {
            throw httpError(401, "Invalid Paystack webhook signature.");
        }
        let event;
        try { event = JSON.parse(rawBody.toString("utf8")); }
        catch { throw httpError(400, "Invalid Paystack webhook JSON."); }

        if (event.event !== "charge.success") return { acknowledged: true, ignored: true };
        const reference = event.data && event.data.reference;
        if (!reference) throw httpError(400, "Paystack success webhook is missing its reference.");
        const result = await verifyAndGrant(reference);
        // Do not acknowledge a success event while the API still reports pending;
        // Paystack will retry the webhook and the grant is reference-idempotent.
        if (result.status !== "success") throw httpError(503, "Paystack webhook transaction is not yet verifiably successful.");
        return { acknowledged: true, ignored: false };
    }

    return { initializeCharge, verifyAndGrant, handleWebhook };
}

module.exports = {
    PAYSTACK_API,
    PLANS,
    createPaystackService,
    normalizeEmail,
    normalizePhone,
    parseMetadata,
    verifyWebhookSignature,
};
