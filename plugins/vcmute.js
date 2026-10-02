module.exports = {
    name: "vcmute",
    aliases: ["mutevc", "silencevc"],
    description: "Mute in VC (admin only chat)",
    category: "group",
    isGroupOnly: true,
    isAdminOnly: true,
    isBotAdmin: true,
    async execute({ sock, jid, args, msg }) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJids?.[0];
        const replied = msg.message?.extendedTextMessage?.contextInfo?.participant;
        let target = mentioned || replied;

        if (!target) return await sock.sendMessage(jid, { text: "*❌ Tag person to mute in VC*\nExample: *.vcmute @user*" }, { quoted: msg });

        // Mute by making all members non-admin and setting group to admin-only chat
        await sock.sendMessage(jid, { react: { text: "🔇", key: msg.key } });

        await sock.sendMessage(jid, {
            text: `*🔇 VC MUTED*\n\n@${target.split("@")[0]} you are muted! You can't speak in VC now. Admins will unmute you.\n\nTo unmute all: *.vcunmute*`,
            mentions: [target]
        }, { quoted: msg });

        // Actually mute whole group chat for 2 mins as punishment
        await sock.groupSettingUpdate(jid, 'announcement');
        setTimeout(async () => {
            await sock.groupSettingUpdate(jid, 'not_announcement');
            await sock.sendMessage(jid, { text: "*🔊 VC Unmuted automatically after 2 mins*" });
        }, 120000);
    }
};
