// Mengimpor modul yang diperlukan dari pustaka 'baileys' untuk fungsionalitas bot WhatsApp
const { BufferJSON, WA_DEFAULT_EPHEMERAL, generateWAMessageFromContent, proto, generateWAMessageContent, generateWAMessage, prepareWAMessageMedia, areJidsSameUser , getContentType } = require("baileys");
// Mengimpor modul sistem file untuk operasi file
const fs = require("fs");
// Mengimpor modul utilitas untuk berbagai fungsi utilitas
const util = require("util");
// Mengimpor chalk untuk output konsol berwarna
const chalk = require("chalk");
// Mengimpor axios untuk membuat permintaan HTTP
const axios = require("axios");

// Mengekspor fungsi utama 'vinn' sebagai modul
module.exports = vinn = async (client, m, chatUpdate) => {
  try {
    // Menentukan isi pesan berdasarkan tipe pesan
    var body = m.mtype === "conversation" ? m.message.conversation :
           m.mtype == "imageMessage" ? m.message.imageMessage.caption :
           m.mtype == "videoMessage" ? m.message.videoMessage.caption :
           m.mtype == "extendedTextMessage" ? m.message.extendedTextMessage.text :
           m.mtype == "buttonsResponseMessage" ? m.message.buttonsResponseMessage.selectedButtonId :
           m.mtype == "listResponseMessage" ? m.message.listResponseMessage.singleSelectReply.selectedRowId :
           m.mtype == "templateButtonReplyMessage" ? m.message.templateButtonReplyMessage.selectedId :
           m.mtype === "messageContextInfo" ? m.message.buttonsResponseMessage?.selectedButtonId || 
           m.message.listResponseMessage?.singleSelectReply.selectedRowId || m.text :
           "";
    // Jika tipe pesan adalah 'viewOnceMessageV2', keluar dari fungsi
    if (m.mtype === "viewOnceMessageV2") return;
    
    // Mengambil teks dari pesan
    var budy = typeof m.text == "string" ? m.text : "";
    // Mengatur prefix perintah, default ke '/' jika tidak ditemukan
    var prefix = /^[\\/!#.]/gi.test(body) ? body.match(/^[\\/!#.]/gi) : "/";
    // Memeriksa apakah pesan adalah perintah
    const isCmd2 = body.startsWith(prefix);
    // Mengambil nama perintah dari pesan
    const command = body.replace(prefix, "").trim().split(/ +/).shift().toLowerCase();
    // Mengambil argumen dari pesan
    const args = body.trim().split(/ +/).slice(1);
    // Mendapatkan nama pengirim atau default ke "No Name"
    const pushname = m.pushName || "No Name";
    // Mendekode nomor bot
    const botNumber = await client.decodeJid(client.user.id);
    // Memeriksa apakah pesan berasal dari bot itu sendiri
    const itsMe = m.sender == botNumber ? true : false;
    // Menggabungkan argumen menjadi satu string teks
    let text = (q = args.join(" "));
    // Mengambil argumen tambahan dari pesan
    const arg = budy.trim().substring(budy.indexOf(" ") + 1);
    const arg1 = arg.trim().substring(arg.indexOf(" ") + 1);

    // Menyimpan detail chat dan pesan
    const from = m.chat;
    const reply = m.reply;
    const sender = m.sender;
    const mek = chatUpdate.messages[0];

    // Fungsi untuk memberi warna pada teks untuk output konsol
    const color = (text, color) => {
      return !color ? chalk.green(text) : chalk.keyword(color)(text);
    };

    // Mengambil metadata grup jika pesan berasal dari grup
    const groupMetadata = m.isGroup ? await client.groupMetadata(m.chat).catch((e) => {}) : "";
    const groupName = m.isGroup ? groupMetadata.subject : "";

    // Mencatat pesan ke konsol
    let argsLog = budy.length > 30 ? `${q.substring(0, 30)}...` : budy;

    // Memeriksa apakah pesan adalah perintah dan bukan dari grup
if (isCmd2 && !m.isGroup) {
  // Mencetak log ke konsol dengan format tertentu jika perintah berasal dari pengguna individu
  console.log(
    chalk.black(chalk.bgWhite("[ LOGS ]")), // Menampilkan label log dengan latar belakang putih dan teks hitam
    color(argsLog, "turquoise"), // Menampilkan argumen log dengan warna turquoise
    chalk.magenta("Dari"), // Menampilkan kata "Dari" dengan warna magenta
    chalk.green(pushname), // Menampilkan nama pengirim dengan warna hijau
    chalk.yellow(`[ ${m.sender.replace("@s.whatsapp.net", "")} ]`) // Menampilkan ID pengirim tanpa domain WhatsApp dengan warna kuning
  );
} else if (isCmd2 && m.isGroup) {
  // Mencetak log ke konsol dengan format tertentu jika perintah berasal dari grup
  console.log(
    chalk.black(chalk.bgWhite("[ LOGS ]")), // Menampilkan label log dengan latar belakang putih dan teks hitam
    color(argsLog, "turquoise"), // Menampilkan argumen log dengan warna turquoise
    chalk.magenta("Dari"), // Menampilkan kata "Dari" dengan warna magenta
    chalk.green(pushname), // Menampilkan nama pengirim dengan warna hijau
    chalk.yellow(`[ ${m.sender.replace("@s.whatsapp.net", "")} ]`), // Menampilkan ID pengirim tanpa domain WhatsApp dengan warna kuning
    chalk.blueBright("DI"), // Menampilkan kata "DI" dengan warna biru terang
    chalk.green(groupName) // Menampilkan nama grup dengan warna hijau
  );
}

// Jika pesan bukan dari bot itu sendiri dan ada isi pesan
if (!itsMe && budy) {
  // Mengambil respons dari API berdasarkan isi pesan
  let res = await axios.get(`https://api.ryzendesu.vip/api/ai/gemini?text=${encodeURIComponent(budy)}`);
  // Mengirimkan respons dari API kembali ke pengirim
  m.reply(res.data.answer);
}
} catch (err) {
  // Menangani kesalahan dengan mengirimkan pesan kesalahan ke pengirim
  m.reply(util.format(err));
}

// Mengawasi file ini untuk perubahan
let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file); // Menghentikan pengawasan file setelah perubahan terdeteksi
  console.log(chalk.redBright(`Update ${__filename}`)); // Menampilkan pesan bahwa file telah diperbarui
  delete require.cache[file]; // Menghapus cache file untuk memuat ulang
  require(file); // Memuat ulang file
});
