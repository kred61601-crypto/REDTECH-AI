const { getGroupActivity } = require("../lib/activeTracker");

module.exports = {
    name: "checkactive",
    aliases: ["active", "activelist", "membersactive"],
    description: "Check active and inactive members",
    category: "group",
    async execute({ sock, jid, msg }) {
        if (!jid.endsWith("@g.us")) return sock.sendMessage(jid, { text: "*❌ This command only for groups*" }, { quoted: msg });

        await sock.sendMessage(jid, { react: { text: "📊", key: msg.key } });

        const groupMetadata = await sock.groupMetadata(jid);
        const participants = groupMetadata.participants;
        const activityDB = getGroupActivity(jid);

        const now = Date.now();
        let activeList = [];
        let inactive7 = [];
        let inactive10 = [];

        for (let p of participants) {
            const userId = p.id;
            if (p.admin) continue; // Skip admins
            const lastActive = activityDB[userId];

            if (!lastActive) {
                inactive10.push(userId);
            } else {
                const days = (now - lastActive) / (1000 * 60 * 60 * 24);
                if (days <= 2) activeList.push({ id: userId, days: days.toFixed(1) });
                else if (days >= 7) inactive7.push(userId);
                if (days >= 10) inactive10.push(userId);
            }
        }

        let text = `*📊 GROUP ACTIVITY REPORT*\n`;
        text += `*Group:* ${groupMetadata.subject}\n`;
        text += `*Total Members:* ${participants.length}\n`;
        text += `━━━━━━━━━━━━━━━━━━\n\n`;
        text += `*🔥 Active (Last 2 Days):* ${activeList.length}\n`;
        text += activeList.slice(0, 15).map(a => `▸ @${a.id.split("@")[0]} - ${a.days}d ago`).join("\n") || "None\n";
        text += `\n\n*😴 Inactive 7+ Days:* ${inactive7.length}\n`;
        text += inactive7.slice(0, 7).map(id => `▸ @${id.split("@")[0]}`).join("\n") || "None\n";
        text += `\n\n*💀 Inactive 5+ Days:* ${inactive10.length}\n`;
        text += inactive10.slice(0, 7).map(id => `▸ @${id.split("@")[0]}`).join("\n") || "None\n";
        text += `\n\n*Use:.removeinactive 7 to kick 7 days inactive*`;

        await sock.sendMessage(jid, {
            text: text,
            mentions: [...activeList.map(a => a.id),...inactive7,...inactive10]
        }, { quoted: msg });
    }
};
