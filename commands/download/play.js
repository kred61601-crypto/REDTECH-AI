const yts = require("yt-search");
const axios = require("axios");

module.exports = {
    name: "play",
    aliases: ["song", "playvideo", "ytmp4", "video", "playdoc"],
    category: "downloader",
    async execute({ sock, jid, msg, args }) {
        try {
            let fullQuery = args.join(" ");
            if (!fullQuery) {
                return await sock.sendMessage(jid, {
                    text: "*Example:*\n.play i love you by rayvanny - Audio\n.play video i love you by rayvanny - Video"
                }, { quoted: msg });
            }

            // DETECT IF USER WANTS VIDEO
            let isVideo = false;
            if (fullQuery.toLowerCase().startsWith("video ")) {
                isVideo = true;
                fullQuery = fullQuery.slice(6).trim(); // remove "video " word
            }

            // If command is ytmp4 or video, force video
            const cmd = msg.message?.extendedTextMessage?.text || msg.message?.conversation || "";
            if (cmd.toLowerCase().includes("ytmp4") || cmd.toLowerCase().startsWith(".video")) isVideo = true;

            await sock.sendMessage(jid, {
                text: isVideo? `*🎬 DOWNLOADING VIDEO...*\n*Searching:* ${fullQuery}` : `*🎧 DOWNLOADING AUDIO...*\n*Searching:* ${fullQuery}\n\n> Redtech Ai`
            }, { quoted: msg });

            const search = await yts(fullQuery);
            if (!search.videos.length) throw new Error("No results found");
            const video = search.videos[0];
            const url = video.url;

            let dlUrl = null;

            if (isVideo) {
                // --- VIDEO DOWNLOAD ---
                try {
                    const r1 = await axios.get(`https://apis.davidcyriltech.my.id/youtube/mp4?url=${url}`, { timeout: 30000 });
                    dlUrl = r1.data?.result?.downloadUrl || r1.data?.url;
                } catch {}
                if (!dlUrl) {
                    try {
                        const r2 = await axios.get(`https://api.siputzx.my.id/api/d/ytmp4?url=${url}`, { timeout: 30000 });
                        dlUrl = r2.data?.data?.dl;
                    } catch {}
                }
                if (!dlUrl) throw new Error("Video API failed");

                await sock.sendMessage(jid, {
                    video: { url: dlUrl },
                    mimetype: "video/mp4",
                    caption: `*🎬 ${video.title}*\n\n*Channel:* ${video.author.name}\n*Duration:* ${video.timestamp}\n*Views:* ${video.views}\n*Uploaded:* ${video.ago}\n*Link:* ${url}\n\n> REDTECH AI`,
                    contextInfo: {
                        externalAdReply: {
                            title: video.title,
                            body: video.author.name,
                            thumbnailUrl: video.thumbnail,
                            mediaType: 1,
                            sourceUrl: url
                        }
                    }
                }, { quoted: msg });

            } else {
                // --- AUDIO DOWNLOAD ---
                try {
                    const r1 = await axios.get(`https://apis.davidcyriltech.my.id/youtube/mp3?url=${url}`, { timeout: 30000 });
                    dlUrl = r1.data?.result?.downloadUrl || r1.data?.url;
                } catch {}
                if (!dlUrl) {
                    try {
                        const r2 = await axios.get(`https://api.ryzumi.vip/api/downloader/ytmp3?url=${url}`, { timeout: 30000 });
                        dlUrl = r2.data?.url;
                    } catch {}
                }
                if (!dlUrl) throw new Error("Audio API failed");

                await sock.sendMessage(jid, {
                    image: { url: video.thumbnail },
                    caption: `*🎧 ${video.title}*\n\n*Artist:* ${video.author.name}\n*Duration:* ${video.timestamp}\n*Views:* ${video.views}\n*Sending audio...*\n\n> REDTECH AI`
                }, { quoted: msg });

                await sock.sendMessage(jid, {
                    audio: { url: dlUrl },
                    mimetype: "audio/mpeg",
                    fileName: `${video.title}.mp3`,
                    contextInfo: {
                        externalAdReply: {
                            title: video.title,
                            body: video.author.name,
                            thumbnailUrl: video.thumbnail,
                            mediaType: 1,
                            sourceUrl: url
                        }
                    }
                }, { quoted: msg });
            }

        } catch (e) {
            console.log(e);
            await sock.sendMessage(jid, { text: `*❌ ERROR:* ${e.message}\nTry again with shorter name` }, { quoted: msg });
        }
    }
};
