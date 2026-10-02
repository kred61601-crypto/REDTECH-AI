const { getGroupActivity, getActiveDB } = require("../lib/activeTracker");

module.exports = {
    name: "removeinactive",
    aliases: ["kickinactive", "inactivekick", "prune"],
    description: "Remove inactive members",
    category: "group",
    isGroupOnly: true,
    isAdminOnly: true,
    isBotAdmin: true,
    async execute({ sock, jid, args, msg }) {
        if (!jid.endsWith("@g.us")) return sock.sendMessage(jid, { text: "*❌ Group only*" }, { quoted: msg });

        const days = parseInt(args[0]) || 7; // Default 7 days
        if (days < 1) return sock.sendMessage(jid, { text: "*❌ Provide days e.g.removeinactive 7*" }, { quoted: msg });

        await sock.sendMessage(jid, { react: { text: "⚡", key: msg.key } });

        const groupMetadata = await sock.groupMetadata(jid);
        const participants = groupMetadata.participants;
        const activityDB = getGroupActivity(jid);
        const now = Date.now();
        const threshold = days * 24 * 60 * 60 * 1000;

        let toKick = [];

        for (let p of participants) {
            if (p.admin) continue; // Don't kick admins
            if (p.id === sock.user.id.split(":")[0] + "@s.whatsapp.net") continue; // Don't kick bot

            const lastActive = activityDB[p.id];
            if (!lastActive) {
                // Never chatted since bot was added
                toKick.push(p.id);
            } else {
                if ((now - lastActive) > threshold) {
                    toKick.push(p.id);
                }
            }
        }

        if (toKick.length === 0) {
            return sock.sendMessage(jid, { text: `*✅ No inactive members found for ${days} days*\nEveryone is active!` }, { quoted: msg });
        }

        // Confirmation
        let confirmText = `*⚠️ KICK INACTIVE CONFIRMATION*\n\n`;
        confirmText += `*Found ${toKick.length} members inactive for ${days}+ days*\n\n`;
        confirmText += toKick.slice(0, 20).map(id => `▸ @${id.split("@")[0]}`).join("\n");
        if (toKick.length > 20) confirmText += `\n...and ${toKick.length - 20} more`;
        confirmText += `\n\n*Kicking in 10 seconds...*\nReply *.stop* to cancel`;

        await sock.sendMessage(jid, { text: confirmText, mentions: toKick }, { quoted: msg });

        // Wait 10 sec then kick with delay to avoid ban
        await new Promise(r => setTimeout(r, 10000));

        let kicked = 0;
        for (let userId of toKick) {
            try {
                await sock.groupParticipantsUpdate(jid, [userId], "remove");
                kicked++;
                await new Promise(r => setTimeout(r, 3000)); // 3 sec delay between kicks - VERY IMPORTANT
            } catch (e) {
                console.log(`Failed to kick ${userId}: ${e.message}`);
            }
        }

        await sock.sendMessage(jid, {
            text: `*✅ DONE!*\n\n*Removed ${kicked}/${toKick.length} inactive members (${days}+ days inactive)*\n\n*Group cleaned successfully!*`,
            mentions: toKick
        }, { quoted: msg });
    }
};
