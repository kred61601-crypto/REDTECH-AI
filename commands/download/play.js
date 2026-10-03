const yts = require("yt-search");
const axios = require("axios");

async function cobaltDownload(youtubeUrl, isAudioOnly = true) {
    try {
        const res = await axios.post("https://api.cobalt.tools/api/json", {
            url: youtubeUrl,
            isAudioOnly: isAudioOnly,
            aFormat: isAudioOnly? "mp3" : "mp4",
            filenamePattern: "basic"
        }, {
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            timeout: 30000
        });
        // cobalt returns url or picks tunnel
        if (res.data?.url) return res.data.url;
        if (res.data?.status === "redirect" || res.data?.status === "tunnel") return res.data.url;
        return null;
    } catch (e) {
        console.log("cobalt fail:", e.message);
        return null;
    }
}

module.exports = {
    name: "play",
    aliases: ["song", "ytmp4", "video", "playvideo"],
    category: "downloader",
    async execute({ sock, jid, msg, args }) {
        try {
            let fullQuery = args.join(" ");
            if (!fullQuery) return await sock.sendMessage(jid, { text: "*Usage:.play rita marlaw*" }, { quoted: msg });

            let isVideo = false;
            if (fullQuery.toLowerCase().startsWith("video ")) {
                isVideo = true;
                fullQuery = fullQuery.slice(6);
            }
            if (fullQuery.toLowerCase().includes("ytmp4") || args[0]?.toLowerCase() === "video") isVideo = true;

            await sock.sendMessage(jid, { text: isVideo? `*🎬 Searching VIDEO:* ${fullQuery}` : `*🎧 Searching AUDIO:* ${fullQuery}\n> Redtech Ai` }, { quoted: msg });

            const search = await yts(fullQuery);
            if (!search.videos.length) throw new Error("No results");
            const video = search.videos[0];
            const url = video.url;

            let dlUrl = await cobaltDownload(url,!isVideo);

            // Fallback 2: wuk.sh cobalt instance
            if (!dlUrl) {
                try {
                    const r = await axios.post("https://co.wuk.sh/api/json", {
                        url: url, isAudioOnly:!isVideo, aFormat: isVideo? "mp4" : "mp3"
                    }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 25000 });
                    if (r.data?.url) dlUrl = r.data.url;
                } catch {}
            }

            // Fallback 3: giftedtech api
            if (!dlUrl) {
                try {
                    const r = await axios.get(`https://api.giftedtech.web.id/api/download/ytmp3?apikey=gifted&url=${url}`, { timeout: 25000 });
                    dlUrl = r.data?.result?.download_url || r.data?.result?.url;
                } catch {}
            }

            if (!dlUrl) throw new Error("All APIs down. Try again in 1 min");

            if (isVideo) {
                await sock.sendMessage(jid, {
                    video: { url: dlUrl },
                    mimetype: "video/mp4",
                    caption: `*${video.title}*\n*Artist:* ${video.author.name}\n*Duration:* ${video.timestamp}\n\n> REDTECH AI`
                }, { quoted: msg });
            } else {
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
            await sock.sendMessage(jid, { text: `*❌ ERROR: ${e.message}*\nAPI busy, try.play rita marlaw again` }, { quoted: msg });
        }
    }
};
