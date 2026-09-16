'use strict';
const fakevCard = {
    key: {
        fromMe: false,
        participant: "0@s.whatsapp.net",
        remoteJid: "status@broadcast"
    },
    message: {
        contactMessage: {
            displayName: "TYREX_KSH MD",
            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:TYREX_KSH MD\nORG:TYREX_KSH TECH;\nTEL;type=CELL;type=VOICE;waid=255610744352:+255 789 661 031\nEND:VCARD`
        }
    }
};
// Export both ways so all plugins work regardless of import style
module.exports = fakevCard;
module.exports.fakevCard = fakevCard;
module.exports.default = fakevCard;