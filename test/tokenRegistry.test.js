const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const registry = require("../saas/tokenRegistry");

const storePath = path.join(__dirname, "../database/firebox_tokens.json");

test("token registry creates opaque tokens and resolves the protected phone internally", async () => {
    try { fs.unlinkSync(storePath); } catch {}
    const token = await registry.create("+254 769 564 723");
    assert.match(token, /^FIREBOX-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const resolved = await registry.resolve(token);
    assert.equal(resolved.phone, "254769564723");
    assert.equal(resolved.record.status, "active");
    assert.equal(resolved.record.pairingAttempts, 0);
    assert.ok(!JSON.stringify({ token }).includes(resolved.phone));
    await registry.markUsed(resolved);
    assert.equal((await registry.resolve(token)).record.pairingAttempts, 1);
    const adminRecords = await registry.listAdmin();
    assert.equal(adminRecords[0].token, token);
    assert.equal(adminRecords[0].phone, "254769564723");
    await assert.rejects(
        () => registry.create("254769564723"),
        /already has a Firebox token/
    );
});

test("verified paid plans issue expiring tokens and repeated references do not double-extend", async () => {
    const phone = "254700000001";
    const firstReference = `fb-${"1".repeat(32)}`;
    const before = Date.now();
    const first = await registry.applyPaidPlan({ phone, days: 7, reference: firstReference });
    assert.match(first.token, /^FIREBOX-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.ok(Date.parse(first.expiresAt) >= before + 7 * 24 * 60 * 60 * 1000 - 1000);
    assert.ok(Date.parse(first.expiresAt) <= Date.now() + 7 * 24 * 60 * 60 * 1000 + 1000);

    const replay = await registry.applyPaidPlan({ phone, days: 7, reference: firstReference });
    assert.equal(replay.token, first.token);
    assert.equal(new Date(replay.expiresAt).getTime(), new Date(first.expiresAt).getTime());

    const secondReference = `fb-${"2".repeat(32)}`;
    const extended = await registry.applyPaidPlan({ phone, days: 14, reference: secondReference });
    assert.equal(extended.token, first.token);
    assert.ok(Date.parse(extended.expiresAt) >= Date.parse(first.expiresAt) + 14 * 24 * 60 * 60 * 1000 - 1000);
    assert.deepEqual(await registry.canPurchase(phone), { allowed: true });
    assert.equal((await registry.getPaidTokenByReference(secondReference)).token, first.token);
});

test.after(() => { try { fs.unlinkSync(storePath); } catch {} });
