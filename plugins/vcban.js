const fs = require("fs");
const path = require("path");
const banPath = path.join(__dirname, "../database/vcban.json");

if (!fs.existsSync(banPath)) fs.writeFileSync(banPath, JSON.stringify({}, null, 2));

module.exports = {
    name: "vcban",
    aliases: ["banvc", "vcblock"],
    description: "Ban from VC for 2 days",
    category: "group",
    isGroupOnly: true,
    isAdminOnly: true,
    isBotAdmin: true,
    async execute({ sock, jid, args, msg }) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJids?.[0];
        const replied = msg.message?.extendedTextMessage?.contextInfo?.participant;
        let target = mentioned || replied;
        const days = parseInt(args[1]) || 2;

        if (!target) return await sock.sendMessage(jid, { text: "*❌ Tag person*\nExample: *.vcban @user 2* (2 days)" }, { quoted: msg });

        // Save ban
        const bans = JSON.parse(fs.readFileSync(banPath));
        if (!bans[jid]) bans[jid] = {};
        bans[jid][target] = Date.now() + (days * 24 * 60 * 60 * 1000);
        fs.writeFileSync(banPath, JSON.stringify(bans, null, 2));

        await sock.groupParticipantsUpdate(jid, [target], "remove");
        await sock.sendMessage(jid, {
            text: `*🚫 VC BANNED FOR ${days} DAYS*\n\n@${target.split("@")[0]} banned from VC & group for ${days} days. If he tries to join back, bot will kick again automatically.`,
            mentions: [target]
        }, { quoted: msg });
    }
};
