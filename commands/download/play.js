// commands/download/play.js
// RED TECH AI - YouTube MP3 Downloader

const axios = require("axios");
const yts = require("yt-search");

module.exports = {
  name: "play",
  aliases: ["ply", "playy", "pl"],
  description: "Search and download a song as MP3",
  category: "download",

  execute: async (context) => {
    const { sock, jid, msg, text } = context;

    const reply = async (message) => {
      await sock.sendMessage(jid, { text: message }, { quoted: msg });
    };

    try {
      const query = (text || "").trim();

      if (!query) {
        return reply(
          "🎵 *RED TECH AI — PLAY*\n\n" +
          "Usage:.play song name\n" +
          "Example:.play Calm Down"
        );
      }

      await sock.sendMessage(
        jid,
        { react: { text: "💽", key: msg.key } }
      );

      // Search YouTube
      const search = await yts(query);
      const video = search.videos && search.videos[0];

      if (!video ||!video.url) {
        await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
        return reply("❌ No results found for: " + query);
      }

      // ===== ADDED PART - PICTURE LIKE YOU ASKED =====
      const caption =
`. AUDIO DOWNLOADER 🎧

    ┌───⪩⪨
    │⊙ Title - ${video.title}
    │⊙ Duration - ${video.timestamp}
    │⊙ Views - ${video.views.toLocaleString()}
    │⊙ Author - ${video.author.name}
    │⊙ Status - Downloading...
    └───⪩⪨`;

      await sock.sendMessage(jid, {
        image: { url: video.thumbnail },
        caption: caption
      }, { quoted: msg });
      // ===== END OF ADDED PART =====

      // Your original download logic continues from here
      const apiUrl = `https://api.davidcyriltech.my.id/youtube/mp3?url=${encodeURIComponent(video.url)}`;

      let audioUrl;
      try {
        const res = await axios.get(apiUrl);
        audioUrl = res.data?.result?.downloadUrl || res.data?.result?.download || res.data?.url;
      } catch (e) {
        console.log("API error:", e.message);
      }

      if (!audioUrl) {
        await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
        return reply("❌ Failed to download. Try again later");
      }

      const audioBuffer = await axios.get(audioUrl, { responseType: "arraybuffer" }).then(r => r.data);

      await sock.sendMessage(jid, {
        audio: Buffer.from(audioBuffer),
        mimetype: "audio/mpeg",
        fileName: `${video.title}.mp3`,
        ptt: false
      }, { quoted: msg });

      await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });

    } catch (err) {
      console.error("PLAY ERROR:", err);
      await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
      await sock.sendMessage(jid, { text: `❌ Error: ${err.message}` }, { quoted: msg });
    }
  },
};
