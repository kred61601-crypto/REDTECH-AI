import { sendInteractive } from '../../lib/sendInteractive.js';

const BOT_NAME = 'RED TECH AI';
const TIMEOUT_MS = 25000;

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RED-TECH-AI/1.0'
    },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Downloader HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Downloader returned invalid JSON: ${body.slice(0, 200)}`);
  }
}

function getYouTubeUrl(query) {
  try {
    const url = new URL(
      /^https?:\/\//i.test(query) ? query : `https://${query}`
    );

    const host = url.hostname.toLowerCase();
    let videoId = '';

    if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] || '';
    } else if (
      host === 'youtube.com' ||
      host.endsWith('.youtube.com')
    ) {
      videoId =
        url.searchParams.get('v') ||
        url.pathname.match(
          /^\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/
        )?.[1] ||
        '';
    } else {
      return null;
    }

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return null;
    }

    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch {
    return null;
  }
}

function extractSong(data) {
  const candidates = [
    data?.result,
    data?.data,
    data?.result?.data,
    data?.result?.result,
    data
  ].filter(Boolean);

  for (const item of candidates) {
    const downloadUrl =
      item.downloadUrl ||
      item.download_url ||
      item.url ||
      item.audio ||
      item.cdn ||
      item.link;

    if (
      typeof downloadUrl === 'string' &&
      /^https?:\/\//i.test(downloadUrl)
    ) {
      return {
        url: downloadUrl,
        title:
          item.title ||
          item.name ||
          item.filename ||
          'Unknown Song',
        thumbnail:
          item.thumbnail ||
          item.image ||
          item.thumb ||
          '',
        videoUrl:
          item.videoUrl ||
          item.video_url ||
          item.source ||
          ''
      };
    }
  }

  return null;
}

function safeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.mp3$/i, '')
    .trim()
    .slice(0, 150) || 'song';
}

export default {
  name: 'play',
  aliases: ['ply', 'playy', 'pl'],
  description: 'Searches and downloads songs as audio',

  run: async (context) => {
    const { client, m, text } = context;
    const reactKey = m.reactKey || m.key;

    const react = async (emoji) => {
      if (!reactKey) return;
      await client.sendMessage(m.chat, {
        react: { text: emoji, key: reactKey }
      }).catch(() => {});
    };

    try {
      const query = typeof text === 'string' ? text.trim() : '';

      if (!query) {
        await react('❌');
        return sendInteractive(
          client,
          m,
          `🎵 ──「 ${BOT_NAME} PLAY 」──
▢ Enter a song name or YouTube video link.
▢ Example: .play Shape of You
▢ Example: .play https://youtu.be/VIDEO_ID
└──👑 ${BOT_NAME}`
        );
      }

      if (query.length > 200) {
        await react('❌');
        return sendInteractive(
          client,
          m,
          `Search query is too long. Keep it under 200 characters.\n👑 ${BOT_NAME}`
        );
      }

      await react('⌛');

      const youtubeUrl = getYouTubeUrl(query);
      let song;

      if (youtubeUrl) {
        // Try the existing direct-YouTube downloader first.
        const endpoint =
          'https://api.sidycoders.xyz/api/ytdl' +
          `?url=${encodeURIComponent(youtubeUrl)}` +
          '&format=mp3&apikey=memberdycoders';

        try {
          const data = await fetchJson(endpoint);
          song = extractSong(data);

          if (!song) {
            console.error(
              '[RED TECH AI] YouTube API response:',
              JSON.stringify(data).slice(0, 1500)
            );
          }
        } catch (error) {
          console.error('[RED TECH AI] YouTube API error:', error.message);
        }

        if (song) {
          song.videoUrl = song.videoUrl || youtubeUrl;
        }
      } else {
        // Search for the song by title.
        let data;

        try {
          const endpoint =
            'https://apiziaul.vercel.app/api/downloader/ytplaymp3' +
            `?query=${encodeURIComponent(query)}`;

          data = await fetchJson(endpoint);
          song = extractSong(data);

          if (!song) {
            console.error(
              '[RED TECH AI] Search API response:',
              JSON.stringify(data).slice(0, 1500)
            );
          }
        } catch (error) {
          console.error('[RED TECH AI] Search API error:', error.message);
        }

        // A failed search API is not a successful "no results" response.
        if (!song) {
          await react('❌');
          return sendInteractive(
            client,
            m,
            `⚠️ ──「 SEARCH FAILED 」──
▢ The song search service failed or returned an unsupported response.
▢ Check your Render logs for [RED TECH AI] Search API.
▢ Try again later or use a YouTube video link.
└──👑 ${BOT_NAME}`
          );
        }
      }

      if (!song) {
        await react('❌');
        return sendInteractive(
          client,
          m,
          `⚠️ ──「 DOWNLOAD FAILED 」──
▢ No usable download link was returned.
▢ The downloader may be offline or its API response may have changed.
▢ Check the Render logs for [RED TECH AI].
└──👑 ${BOT_NAME}`
        );
      }

      // Verify that the download URL is reachable before sending it.
      let audioResponse;

      try {
        audioResponse = await fetch(song.url, {
          headers: { 'User-Agent': 'RED-TECH-AI/1.0' },
          signal: AbortSignal.timeout(TIMEOUT_MS)
        });
      } catch (error) {
        throw new Error(`Audio URL could not be fetched: ${error.message}`);
      }

      if (!audioResponse.ok) {
        await audioResponse.body?.cancel().catch(() => {});
        throw new Error(`Audio download returned HTTP ${audioResponse.status}`);
      }

      const contentType = (
        audioResponse.headers.get('content-type') || ''
      ).toLowerCase();

      if (
        contentType.includes('text/html') ||
        contentType.includes('application/json')
      ) {
        await audioResponse.body?.cancel().catch(() => {});
        throw new Error(
          `Download URL returned ${contentType}, not audio`
        );
      }

      const contentLength = Number(
        audioResponse.headers.get('content-length') || 0
      );

      if (contentLength > 25 * 1024 * 1024) {
        await audioResponse.body?.cancel().catch(() => {});
        throw new Error('Audio file exceeds the 25 MB safety limit');
      }

      // Buffer the audio so Baileys does not have to fetch an
      // expiring or inaccessible external URL a second time.
      const chunks = [];
      let totalBytes = 0;

      for await (const chunk of audioResponse.body) {
        totalBytes += chunk.length;

        if (totalBytes > 25 * 1024 * 1024) {
          throw new Error('Audio file exceeds the 25 MB safety limit');
        }

        chunks.push(Buffer.from(chunk));
      }

      const audioBuffer = Buffer.concat(chunks);

      if (!audioBuffer.length) {
        throw new Error('Downloader returned an empty audio file');
      }

      const filename = safeFilename(song.title);
      const thumbnail = song.thumbnail;

      await client.sendMessage(m.chat, {
        audio: audioBuffer,
        mimetype: contentType.includes('ogg')
          ? 'audio/ogg'
          : contentType.includes('mp4')
            ? 'audio/mp4'
            : 'audio/mpeg',
        fileName: `${filename}.mp3`,
        contextInfo: thumbnail
          ? {
              externalAdReply: {
                title: filename.slice(0, 60),
                body: BOT_NAME,
                thumbnailUrl: thumbnail,
                sourceUrl: song.videoUrl || song.url,
                mediaType: 1,
                renderLargerThumbnail: true
              }
            }
          : undefined
      });

      await react('✅');
    } catch (error) {
      console.error('[RED TECH AI] Play error:', error);

      await react('❌');

      await sendInteractive(
        client,
        m,
        `⚠️ ──「 PLAY ERROR 」──
▢ The song could not be downloaded or sent.
▢ Reason: ${String(error.message || 'Unknown error').slice(0, 180)}
▢ Check the Render logs for details.
└──👑 ${BOT_NAME}`
      );
    }
  }
};
