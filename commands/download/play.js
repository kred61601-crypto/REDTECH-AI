import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import yts from 'yt-search';
import ytdl from '@distube/ytdl-core';
import fs from 'fs';
import path from 'path';

async function handlePlayCommand(sock, remoteJid, msgKey, searchQuery) {
  try {
    // 1. Notify user that downloading has started
    await sock.sendMessage(remoteJid, { text: '⏳ *DOWNLOADING...*' }, { quoted: msgKey });

    // 2. Search for the video on YouTube
    const searchResults = await yts(searchQuery);
    const video = searchResults.videos[0];

    if (!video) {
      return await sock.sendMessage(remoteJid, { text: '❌ No results found.' }, { quoted: msgKey });
    }

    const filePath = path.join('./temp', `${Date.now()}.mp3`);

    // 3. Download audio stream
    const stream = ytdl(video.url, {
      filter: 'audioonly',
      quality: 'highestaudio',
    });

    const fileStream = fs.createWriteStream(filePath);
    stream.pipe(fileStream);

    fileStream.on('finish', async () => {
      // 4. Send the audio file to WhatsApp
      await sock.sendMessage(
        remoteJid,
        {
          audio: fs.readFileSync(filePath),
          mimetype: 'audio/mp4',
          ptt: false, // set true for voice note format
          fileName: `${video.title}.mp3`
        },
        { quoted: msgKey }
      );

      // Clean up local temp file
      fs.unlinkSync(filePath);
    });

    stream.on('error', async (err) => {
      console.error('YTDL Stream Error:', err);
      await sock.sendMessage(remoteJid, { text: '❌ ERROR OCCURRED – TRY AGAIN LATER.' }, { quoted: msgKey });
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

  } catch (error) {
    console.error('Play Command Error:', error);
    await sock.sendMessage(remoteJid, { text: '❌ ERROR OCCURRED – TRY AGAIN LATER.' }, { quoted: msgKey });
  }
}
