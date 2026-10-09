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
          "Usage: .play song name\n" +
          "Example: .play Calm Down"
        );
      }

      await sock.sendMessage(
        jid,
        { react: { text: "⏳", key: msg.key } }
      );

      // Search YouTube
      const search = await yts(query);
      const video = search.videos && search.videos[0];

      if (!video || !video.url) {
        await sock.sendMessage(
          jid,
          { react: { text: "❌", key: msg.key } }
        );
        return reply("❌ I couldn't find that song. Try another title.");
      }

      await reply(
        "🎶 *RED TECH AI*\n\n" +
        `*Title:* ${video.title}\n` +
        `*Duration:* ${video.timestamp || "Unknown"}\n` +
        `*Link:* ${video.url}\n\n` +
        "⏳ Preparing your audio..."
      );

      // Try the existing audio API
      const api =
        "https://apiziaul.vercel.app/api/downloader/ytplaymp3?query=" +
        encodeURIComponent(video.title);

      const response = await axios.get(api, {
        timeout: 60000,
        headers: { Accept: "application/json" }
      });

      const data = response.data;
      const audioUrl =
        data?.result?.downloadUrl ||
        data?.result?.url ||
        data?.downloadUrl ||
        data?.url ||
        data?.result?.download?.url;

      if (!data?.status || !audioUrl) {
        await sock.sendMessage(
          jid,
          { react: { text: "❌", key: msg.key } }
        );
        return reply(
          "❌ The song was found, but the audio service did not return a download link. Please try again later."
        );
      }

      // Download audio into memory
      const audioResponse = await axios.get(audioUrl, {
        responseType: "arraybuffer",
        timeout: 120000,
        maxContentLength: 25 * 1024 * 1024,
        maxBodyLength: 25 * 1024 * 1024
      });

      const audio = Buffer.from(audioResponse.data);

      if (!audio.length) {
        throw new Error("The downloaded audio was empty.");
      }

      const safeTitle = String(video.title)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .slice(0, 100);

      await sock.sendMessage(
        jid,
        {
          audio,
          mimetype: "audio/mpeg",
          fileName: `${safeTitle}.mp3`
        },
        { quoted: msg }
      );

      await sock.sendMessage(
        jid,
        { react: { text: "✅", key: msg.key } }
      );

    } catch (error) {
      console.error("[RED TECH AI PLAY ERROR]", error?.response?.data || error);

      try {
        await sock.sendMessage(
          jid,
          { react: { text: "❌", key: msg.key } }
        );

        await reply(
          "❌ Sorry, I couldn't download that song right now. The download service may be unavailable. Please try again later."
        );
      } catch (sendError) {
        console.error("[RED TECH AI PLAY REPLY ERROR]", sendError);
      }
    }
  }
};
