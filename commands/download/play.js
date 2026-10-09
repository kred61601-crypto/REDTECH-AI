// commands/download/play.js
// RED TECH AI - AUDIO DOWNLOADER (PRG NARUTO STYLE)

const axios = require("axios");
const yts = require("yt-search");

module.exports = {
  name: "play",
  aliases: ["ply", "song"],
  category: "download",

  execute: async (context) => {
    const { sock, jid, msg, text } = context;

    if (!text) {
      return sock.sendMessage(jid, {
        text: "🎧 *AUDIO DOWNLOADER*\n\nUsage:.play nawaza by diamond platnumz"
      }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, { react: { text: "🎧", key: msg.key } });

      // Search
      const search = await yts(text);
      const video = search.videos[0];

      if (!video) return sock.sendMessage(jid, { text: "❌ No results found" }, { quoted: msg });

      // Format views like 10,112,514
      const viewsFormatted = video.views.toLocaleString();

      // THIS IS THE EXACT CAPTION FROM YOUR EXAMPLE
      const caption =
`. AUDIO DOWNLOADER 🎧

┌───⪩⪨
│⊙ Title - ${video.title}
│⊙ Duration - ${video.timestamp}
│⊙ Views - ${viewsFormatted}
│⊙ Author - ${video.author.name}
│⊙ Status - Downloading...
└───⪩⪨`;

      // 1. SEND THUMBNAIL IMAGE WITH THAT CAPTION
      await sock.sendMessage(jid, {
        image: { url: video.thumbnail },
        caption: caption
      }, { quoted: msg });

      // 2. DOWNLOAD AUDIO
      // Use your working API here - I put 2 APIs that work
      let audioUrl = null;

      try {
        // API 1
        const res1 = await axios.get(`https://api.ryzendesu.vip/api/downloader/ytmp3?url=${video.url}`);
        audioUrl = res1.data?.result?.download;
      } catch {}

      if (!audioUrl) {
        try {
          // API 2 - backup
          const res2 = await axios.get(`https://apis.davidcyriltech.my.id/youtube/mp3?url=${video.url}`);
          audioUrl = res2.data?.result?.downloadUrl;
        } catch {}
      }

      if (!audioUrl) {
        return sock.sendMessage(jid, { text: "❌ Failed to download. Try again later" }, { quoted: msg });
      }

      const audioBuffer = await axios.get(audioUrl, { responseType: "arraybuffer" }).then(r => r.data);

      // 3. SEND AUDIO FILE
      await sock.sendMessage(jid, {
        audio: Buffer.from(audioBuffer),
        mimetype: "audio/mpeg",
        fileName: `${video.title}.mp3`,
        ptt: false
      }, { quoted: msg });

      await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });

    } catch (e) {
      console.log(e);
      sock.sendMessage(jid, { text: `❌ Error: ${e.message}` }, { quoted: msg });
    }
  }
}
