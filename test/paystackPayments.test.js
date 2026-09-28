const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
    PLANS,
    createPaystackService,
    verifyWebhookSignature,
} = require("../saas/paystackPayments");

function jsonResponse(data, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return data; },
    };
}

function validTransaction(reference, overrides = {}) {
    return {
        reference,
        status: "success",
        amount: 2900,
        currency: "KES",
        channel: "mobile_money",
        metadata: {
            application: "firebox-bot",
            plan_days: 7,
            plan_amount_kes: 29,
            phone: "254712345678",
            email: "buyer@example.com",
        },
        customer: { email: "buyer@example.com" },
        ...overrides,
    };
}

function makeService(fetchImpl, tokenRegistry = {}) {
    return createPaystackService({
        tokenRegistry: {
            async canPurchase() { return { allowed: true }; },
            async applyPaidPlan(value) {
                tokenRegistry.applied = (tokenRegistry.applied || []).concat(value);
                return { token: "FIREBOX-ABCD-2345", expiresAt: "2030-01-01T00:00:00.000Z" };
            },
        },
        fetchImpl,
        getSecret: () => "sk_test_unit_test_key",
        isEnabled: () => true,
    });
}

test("the configured paid access plans are fixed server-side", () => {
    assert.deepEqual(PLANS, {
        7: { days: 7, amount: 29 },
        14: { days: 14, amount: 49 },
        30: { days: 30, amount: 99 },
    });
});

test("initializes Paystack's KES M-PESA charge with a server-generated reference", async () => {
    let sent;
    const service = makeService(async (url, options) => {
        sent = { url, options, body: JSON.parse(options.body) };
        return jsonResponse({ status: true, data: { reference: sent.body.reference, status: "pay_offline", display_text: "Approve the prompt." } });
    });

    const charge = await service.initializeCharge({ phone: "+254 712 345 678", email: "Buyer@example.com", days: 7 });
    assert.equal(sent.url, "https://api.paystack.co/charge");
    assert.equal(sent.options.method, "POST");
    assert.match(sent.options.headers.Authorization, /^Bearer sk_test_/);
    assert.equal(sent.body.amount, 2900);
    assert.equal(sent.body.currency, "KES");
    assert.equal(sent.body.email, "buyer@example.com");
    assert.deepEqual(sent.body.mobile_money, { phone: "+254712345678", provider: "mpesa" });
    assert.equal(sent.body.metadata.application, "firebox-bot");
    assert.equal(sent.body.metadata.plan_days, 7);
    assert.equal(charge.reference, sent.body.reference);
    assert.equal(charge.status, "pay_offline");
});

test("rejects unsupported plans and non-Kenyan numbers without contacting Paystack", async () => {
    let calls = 0;
    const service = makeService(async () => { calls++; return jsonResponse({ status: true, data: {} }); });
    await assert.rejects(service.initializeCharge({ phone: "254712345678", email: "buyer@example.com", days: 21 }), /available access plans/);
    await assert.rejects(service.initializeCharge({ phone: "0712345678", email: "buyer@example.com", days: 7 }), /Kenyan M-PESA number/);
    assert.equal(calls, 0);
});

test("a pending Paystack verification does not issue or extend a token", async () => {
    const reference = `fb-${"a".repeat(32)}`;
    const body = validTransaction(reference, { status: "pending" });
    let grants = 0;
    const service = createPaystackService({
        tokenRegistry: { async applyPaidPlan() { grants++; } },
        fetchImpl: async () => jsonResponse({ status: true, data: body }),
        getSecret: () => "sk_test_unit_test_key",
        isEnabled: () => true,
    });
    const result = await service.verifyAndGrant(reference);
    assert.equal(result.status, "pending");
    assert.equal(grants, 0);
});

test("only a verified, matching successful transaction grants the selected plan", async () => {
    const reference = `fb-${"b".repeat(32)}`;
    const body = validTransaction(reference);
    const registry = {};
    const service = makeService(async () => jsonResponse({ status: true, data: body }), registry);
    const result = await service.verifyAndGrant(reference);
    assert.equal(result.status, "success");
    assert.equal(result.token, "FIREBOX-ABCD-2345");
    assert.deepEqual(registry.applied, [{ phone: "254712345678", days: 7, reference }]);
});

test("rejects a successful response with the wrong amount and grants nothing", async () => {
    const reference = `fb-${"c".repeat(32)}`;
    const registry = {};
    const service = makeService(async () => jsonResponse({ status: true, data: validTransaction(reference, { amount: 1 }) }), registry);
    await assert.rejects(service.verifyAndGrant(reference), /does not match a Firebox access plan/);
    assert.equal(registry.applied, undefined);
});

test("webhook signatures use HMAC-SHA512 over exact raw bytes", () => {
    const rawBody = Buffer.from('{"event":"charge.success"}');
    const secret = "sk_test_signature_key";
    const signature = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
    assert.equal(verifyWebhookSignature(rawBody, signature, secret), true);
    assert.equal(verifyWebhookSignature(rawBody, `${signature.slice(0, -1)}0`, secret), false);
    assert.equal(verifyWebhookSignature(Buffer.from(`${rawBody} `), signature, secret), false);
});

test("charge.success webhooks re-verify the transaction before granting access", async () => {
    const reference = `fb-${"d".repeat(32)}`;
    const secret = "sk_test_webhook_key";
    const rawBody = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference } }));
    const signature = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
    let verifiedUrl = "";
    let grants = 0;
    const service = createPaystackService({
        tokenRegistry: {
            async applyPaidPlan() {
                grants++;
                return { token: "FIREBOX-ABCD-2345", expiresAt: "2030-01-01T00:00:00.000Z" };
            },
        },
        fetchImpl: async url => {
            verifiedUrl = url;
            return jsonResponse({ status: true, data: validTransaction(reference) });
        },
        getSecret: () => secret,
        isEnabled: () => true,
    });
    const result = await service.handleWebhook({ rawBody, signature });
    assert.equal(result.acknowledged, true);
    assert.match(verifiedUrl, /\/transaction\/verify\//);
    assert.equal(grants, 1);
});

test("invalid webhook signatures are rejected before Paystack or token operations", async () => {
    let calls = 0;
    const service = createPaystackService({
        tokenRegistry: { async applyPaidPlan() { calls++; } },
        fetchImpl: async () => { calls++; return jsonResponse({}); },
        getSecret: () => "sk_test_webhook_key",
        isEnabled: () => true,
    });
    await assert.rejects(service.handleWebhook({ rawBody: Buffer.from("{}"), signature: "invalid" }), /Invalid Paystack webhook signature/);
    assert.equal(calls, 0);
});

test("disabling new checkouts does not strand a charge awaiting final verification", async () => {
    const reference = `fb-${"e".repeat(32)}`;
    const service = createPaystackService({
        tokenRegistry: {
            async applyPaidPlan() { return { token: "FIREBOX-ABCD-2345", expiresAt: "2030-01-01T00:00:00.000Z" }; },
        },
        fetchImpl: async () => jsonResponse({ status: true, data: validTransaction(reference) }),
        getSecret: () => "sk_test_unit_test_key",
        isEnabled: () => false,
    });
    await assert.rejects(service.initializeCharge({ phone: "254712345678", email: "buyer@example.com", days: 7 }), /not configured/);
    const verified = await service.verifyAndGrant(reference);
    assert.equal(verified.status, "success");
});
