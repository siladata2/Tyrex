'use strict';
// lib/messageConfig.js — central channelInfo helper
const settings = require('../settings');

module.exports = {
    get channelInfo() { return settings.channelInfo || {}; }
};
