module.exports = {
    name: "vckick",
    aliases: ["kickvc", "vcout", "removevc"],
    description: "Remove person from VC (kick from group)",
    category: "group",
    isGroupOnly: true,
    isAdminOnly: true,
    isBotAdmin: true,
    async execute({ sock, jid, args, msg }) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJids?.[0];
        const replied = msg.message?.extendedTextMessage?.contextInfo?.participant;
        let target = mentioned || replied || (args[0]? args[0].replace(/[^0-9]/g, "") + "@s.whatsapp.net" : null);

        if (!target) {
            return await sock.sendMessage(jid, { text: "*❌ Reply to person in VC or tag him*\nExample: *.vckick @user* or reply to his message" }, { quoted: msg });
        }

        await sock.sendMessage(jid, { react: { text: "🎙️", key: msg.key } });

        try {
            await sock.groupParticipantsUpdate(jid, [target], "remove");
            await sock.sendMessage(jid, {
                text: `*🎙️ VC REMOVED*\n\n@${target.split("@")[0]} has been removed from group and VC`,
                mentions: [target]
            }, { quoted: msg });
        } catch (e) {
            await sock.sendMessage(jid, { text: `*❌ Failed:* ${e.message}\nMake bot admin` }, { quoted: msg });
        }
    }
};
