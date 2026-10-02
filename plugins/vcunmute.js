module.exports = {
    name: "vcunmute",
    aliases: ["unmutevc"],
    category: "group",
    async execute({ sock, jid, msg }) {
        await sock.groupSettingUpdate(jid, 'not_announcement');
        await sock.sendMessage(jid, { text: "*🔊 VC UNMUTED - Everyone can speak now*" }, { quoted: msg });
    }
};
