const sessionName = "session"; // nama sesi buat nyimpen kredensialnya
const {
  default: Connect,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidDecode,
  proto,
  getContentType,
  Browsers, 
  fetchLatestWaWebVersion
} = require("baileys");
const pino = require("pino"); //buat logging
const { Boom } = require("@hapi/boom"); //buat tau apa yang error
const fs = require("fs"); // buat baca file
const axios = require("axios"); // buat manggil api
const chalk = require("chalk"); // supaya konsolnya berwarna
const figlet = require("figlet"); // sama kaya chalk, cuma ini buat style fontnya
const _ = require("lodash"); // gatau:v
const PhoneNumber = require("awesome-phonenumber"); //informasi nomer telepon internasional
//pnyimpanan dalam memori untuk menyimpan data
const store = makeInMemoryStore({ logger: pino().child({ level: "silent", stream: "store" }) });
// Fungsi untuk memberi warna pada teks
const color = (text, color) => {
  return !color ? chalk.green(text) : chalk.keyword(color)(text);
};
// format pesan yang diterima
function smsg(conn, m, store) {
  if (!m) return m; // jika tidak ada pesan, batalkan
  let M = proto.WebMessageInfo; //ngambil tipe pesan dari protokol
  if (m.key) {
    // Mengatur beberapa properti pesan berdasarkan kunci
    m.id = m.key.id; 
    m.isBaileys = m.id.startsWith("BAE5") && m.id.length === 16; // Memeriksa apakah pesan berasal dari Baileys atau dari botnya sendiri
    m.chat = m.key.remoteJid; // Mengambil ID chat
    m.fromMe = m.key.fromMe; // sama kaya m.isBaileys, bedanya cuma ini baca keduanya, kalo m.isBaileys itu dari bot dan bukan di aplikasi wa
    m.isGroup = m.chat.endsWith("@g.us"); // grup atau tidak
    m.sender = conn.decodeJid((m.fromMe && conn.user.id) || m.participant || m.key.participant || m.chat || ""); // Mendapatkan ID pengirim
    if (m.isGroup) m.participant = conn.decodeJid(m.key.participant) || ""; // Mendapatkan ID member grup
  }
  if (m.message) {
    // Mengatur tipe dan isi pesan
    m.mtype = getContentType(m.message);
    m.msg = m.mtype == "viewOnceMessage" ? m.message[m.mtype].message[getContentType(m.message[m.mtype].message)] : m.message[m.mtype];
    m.body =
      m.message.conversation ||
      m.msg.caption ||
      m.msg.text ||
      (m.mtype == "viewOnceMessage" && m.msg.caption) ||
      m.text;
    let quoted = (m.quoted = m.msg.contextInfo ? m.msg.contextInfo.quotedMessage : null); // Mengambil pesan yang dikutip
    m.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []; // Mengambil ID yang disebutkan
    if (m.quoted) {
      // Mengatur properti untuk pesan yang dikutip
      let type = getContentType(quoted);
      m.quoted = m.quoted[type];
      if (["productMessage"].includes(type)) {
        type = getContentType(m.quoted);
        m.quoted = m.quoted[type];
      }
      if (typeof m.quoted === "string")
        m.quoted = {
          text: m.quoted,
        };
      m.quoted.mtype = type; //mendapatkan tipe pesan quoted
      m.quoted.id = m.msg.contextInfo.stanzaId; //mendapatkan id dari pesan yang di quoted
      m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat; //mendapatkan id chat dari pesan yang di quoted
      m.quoted.isBaileys = m.quoted.id ? m.quoted.id.startsWith("BAE5") && m.quoted.id.length === 16 : false; //memeriksa apakah pesan yang di quoted berasal dari bot
      m.quoted.sender = conn.decodeJid(m.msg.contextInfo.participant); //mendapatkan pengirim dari pesan yang di quoted
      m.quoted.fromMe = m.quoted.sender === conn.decodeJid(conn.user.id); //memeriksa apakah pesan yang di quoted berasal dari bot
      m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || m.quoted.title || ""; //mendapatkan teks dari berbagai tipe esan yang di quoted
      m.quoted.mentionedJid = m.msg.contextInfo ? m .msg.contextInfo.mentionedJid : []; //:v
      m.getQuotedObj = m.getQuotedMessage = async () => { //mendapatkan objek pesan dari pesan yang di quoted
        if (!m.quoted.id) return false;
        let q = await store.loadMessage(m.chat, m.quoted.id, conn);
        return exports.smsg(conn, q, store);
      };
      let vM = (m.quoted.fakeObj = M.fromObject({
        key: {
          remoteJid: m.quoted.chat,
          fromMe: m.quoted.fromMe,
          id: m.quoted.id,
        },
        message: quoted,
        ...(m.isGroup ? { participant: m.quoted.sender } : {}),
      }));

      m.quoted.delete = () => conn.sendMessage(m.quoted.chat, { delete: vM.key }); // menghapus pesan yang di balas/quoted

      m.quoted.copyNForward = (jid, forceForward = false, options = {}) => conn.copyNForward(jid, vM, forceForward, options); //meneruskan pesan yang dibalas/quoted

      m.quoted.download = () => conn.downloadMediaMessage(m.quoted); // mendownload pesan yang di quoted
    }
  }
  if (m.msg.url) m.download = () => conn.downloadMediaMessage(m.msg);
  m.text = m.msg.text || m.msg.caption || m.message.conversation || m.msg.contentText || m.msg.selectedDisplayText || m.msg.title || ""; //mengambil text dari berbagai tipe pesan
  
  m.reply = (text, chatId = m.chat, options = {}) => (Buffer.isBuffer(text) ? conn.sendMedia(chatId, text, "file", "", m, { ...options }) : conn.sendText(chatId, text, m, { ...options })); //fungsi balas pesan dengan quoted
  
  m.copy = () => exports.smsg(conn, M.fromObject(M.toObject(m))); // fungsi salin

  return m;
}

async function startHisoka() { //fungsi untuk memulai bot
  const { state, saveCreds } = await useMultiFileAuthState(`./${sessionName ? sessionName : "session"}`); // membuat folder sesi
  const { version, isLatest } = await fetchLatestWaWebVersion().catch(() => fetchLatestBaileysVersion()); //mendapakan versi dari baileys
  console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`); 
  console.log(
    color(
      figlet.textSync("Vinn AI", {
        font: "Standard",
        horizontalLayout: "default",
        vertivalLayout: "default",
        whitespaceBreak: false,
      }),
      "green"
    )
  );

  // Menghubungkan klien ke WhatsApp dengan pengaturan tertentu
const client = Connect({ 
    version: [ 2, 3000, 1015901307 ], // Versi API yang digunakan
    logger: pino({ level: "silent" }), // Mengatur logger untuk tidak menampilkan log
    printQRInTerminal: false, // Tidak mencetak QR di terminal
    browser: Browsers.macOS('Chrome'), // Menentukan browser yang digunakan
    auth: state, // Menggunakan state yang sudah ada untuk autentikasi
});

// Mengikat penyimpanan data ke event client
store?.bind(client.ev);

// Menangani event ketika ada pesan baru
client.ev.on("messages.upsert", async (chatUpdate) => {
    try {
        mek = chatUpdate.messages[0]; // Mengambil pesan pertama dari update
        if (!mek.message) return; // Jika tidak ada pesan, keluar dari fungsi
        // Mengambil isi pesan jika itu adalah pesan sementara
        mek.message = Object.keys(mek.message)[0] === "ephemeralMessage" ? mek.message.ephemeralMessage.message : mek.message;
        // Mengabaikan pesan dari status broadcast
        if (mek.key && mek.key.remoteJid === "status@broadcast") return;
        // Mengabaikan pesan yang bukan dari bot jika bot tidak dalam mode publik
        if (!client.public && !mek.key.fromMe && chatUpdate.type === "notify") return;
        // Mengabaikan pesan yang sudah diproses
        if (mek.key.id.startsWith("BAE5") && mek.key.id.length === 16) return;
        // Memformat pesan yang diterima
        m = smsg(client, mek, store);
        // Memanggil modul lain untuk memproses pesan
        require("./vinn")(client, m, chatUpdate, store);
    } catch (err) {
        console.log(err); // Menangkap dan mencetak kesalahan
    }
});

// Menangani unhandled rejections
const unhandledRejections = new Map();
process.on("unhandledRejection", (reason, promise) => {
    unhandledRejections.set(promise, reason); // Menyimpan promise yang tidak tertangani
    console.log("Unhandled Rejection at:", promise, "reason:", reason); // Mencetak informasi tentang rejection
});
process.on("rejectionHandled", (promise) => {
    unhandledRejections.delete(promise); // Menghapus promise yang sudah ditangani
});
process.on("Something went wrong", function (err) {
    console.log("Caught exception: ", err); // Menangkap dan mencetak kesalahan
});

// Fungsi untuk mendekode JID (ID pengguna)
client.decodeJid = (jid) => {
    if (!jid) return jid; // Jika tidak ada JID, kembalikan
    if (/:\d+@/gi.test(jid)) { // Jika JID memiliki format tertentu
        let decode = jidDecode(jid) || {}; // Mendekode JID
        return (decode.user && decode.server && decode.user + "@" + decode.server) || jid; // Mengembalikan JID yang terdekode
    } else return jid; // Kembalikan JID asli
};

// Menangani update kontak
client.ev.on("contacts.update", (update) => {
    for (let contact of update) {
        let id = client.decodeJid(contact.id); // Mendekode ID kontak
        if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }; // Menyimpan kontak ke penyimpanan
    }
});

// Fungsi untuk mendapatkan nama kontak berdasarkan JID
client.getName = (jid, withoutContact = false) => {
    id = client.decodeJid(jid); // Mendekode JID
    withoutContact = client.withoutContact || withoutContact; // Menentukan apakah tanpa kontak
    let v;
    if (id.endsWith("@g.us")) // Jika JID adalah grup
        return new Promise(async (resolve) => {
            v = store.contacts[id] || {}; // Mengambil kontak dari penyimpanan
            if (!(v.name || v.subject)) v = client.groupMetadata(id) || {}; // Mengambil metadata grup jika tidak ada nama
            resolve(v.name || v.subject || PhoneNumber("+" + id.replace("@s.whatsapp.net", "")).getNumber("international")); // Mengembalikan nama atau nomor internasional
        });
    else
        v =
            id === "0@s.whatsapp.net" // Jika JID adalah WhatsApp
                ? {
                    id,
                    name: "WhatsApp",
                }
                : id === client.decodeJid(client.user.id) // Jika JID adalah ID bot
                ? client.user
                : store.contacts[id] || {}; // Mengambil kontak dari peny impanan
    return (withoutContact ? "" : v.name) || v.subject || v.verifiedName || PhoneNumber("+" + jid.replace("@s.whatsapp.net", "")).getNumber("international"); // Mengembalikan nama atau nomor internasional
};

// Menandai klien sebagai publik
client.public = true;

// Fungsi untuk menyusun pesan
client.serializeM = (m) => smsg(client, m, store);

// Menangani pembaruan koneksi
client.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update; // Mengambil status koneksi dan pemutusan terakhir
    if (connection === "close") { // Jika koneksi ditutup
        let reason = new Boom(lastDisconnect?.error)?.output.statusCode; // Mendapatkan alasan pemutusan
        if (reason === DisconnectReason.badSession) {
            console.log(`Bad Session File, Please Delete Session and Scan Again`); // Menangani sesi yang buruk
            process.exit(); // Keluar dari proses
        } else if (reason === DisconnectReason.connectionClosed) {
            console.log("Connection closed, reconnecting...."); // Menangani koneksi yang ditutup
            startHisoka(); // Memulai kembali
        } else if (reason === DisconnectReason.connectionLost) {
            console.log("Connection Lost from Server, reconnecting..."); // Menangani koneksi yang hilang
            startHisoka(); // Memulai kembali
        } else if (reason === DisconnectReason.connectionReplaced) {
            console.log("Connection Replaced, Another New Session Opened, Please Restart Bot"); // Menangani sesi yang diganti
            process.exit(); // Keluar dari proses
        } else if (reason === DisconnectReason.loggedOut) {
            console.log(`Device Logged Out, Please Delete Folder session and Scan Again.`); // Menangani perangkat yang keluar
            process.exit(); // Keluar dari proses
        } else if (reason === DisconnectReason.restartRequired) {
            console.log("Restart Required, Restarting..."); // Menangani restart yang diperlukan
            startHisoka(); // Memulai kembali
        } else if (reason === DisconnectReason.timedOut) {
            console.log("Connection TimedOut, Reconnecting..."); // Menangani timeout koneksi
            startHisoka(); // Memulai kembali
        } else {
            console.log(`Unknown DisconnectReason: ${reason}|${connection}`); // Menangani alasan pemutusan yang tidak dikenal
            startHisoka(); // Memulai kembali
        }
    } else if (connection === "open") { // Jika koneksi terbuka
        const botNumber = await client.decodeJid(client.user.id); // Mendapatkan nomor bot
        console.log(color("Bot success connected to server", "green")); // Menampilkan pesan sukses
        console.log(color("Type /menu to see menu")); // Menampilkan instruksi
        client.sendMessage(botNumber, { text: `Bot Connected!` }); // Mengirim pesan bahwa bot terhubung
    }
});

// Menangani pembaruan kredensial
client.ev.on("creds.update", saveCreds);

// Fungsi untuk mendapatkan buffer dari URL
const getBuffer = async (url, options) => {
    try {
        options ? options : {}; // Menentukan opsi
        const res = await axios({
            method: "get", // Menggunakan metode GET
            url, // URL yang diberikan
            headers: {
                DNT: 1, // Mengatur header DNT
                "Upgrade-Insecure-Request": 1, // Mengatur header upgrade
            },
            ...options, // Menambahkan opsi
            responseType: "arraybuffer", // Mengatur tipe respons
        });
        return res.data; // Mengembalikan data respons
    } catch (err) {
        return err; // Mengembalikan kesalahan
    }
};


// Fungsi untuk mengirim teks
client.sendText = (jid, text, quoted = "", options) => client.sendMessage(jid, { text: text, ...options }, { quoted }); // Mengirim pesan teks

  
return client; // Mengembalikan klien yang telah terhubung
}

startHisoka(); // Memulai fungsi untuk menghubungkan bot

let file = require.resolve(__filename); // Mengambil file saat ini
fs.watchFile(file, () => { // Memantau perubahan pada file
    fs.unwatchFile(file); // Menghentikan pemantauan
    console.log(chalk.redBright(`Update ${__filename}`)); // Menampilkan pesan pembaruan
    delete require.cache[file]; // Menghapus cache file
    require(file); // Memuat ulang file
});
