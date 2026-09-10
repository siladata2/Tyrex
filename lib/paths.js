/* Powerd By Sila Tech */

const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const ASSETS_DIR = path.join(process.cwd(), 'assets');
const TEMP_DIR = path.join(process.cwd(), 'temp');
const SESSION_DIR = path.join(process.cwd(), 'session');

const dataFile = (filename) => path.join(DATA_DIR, filename);

module.exports = {
    DATA_DIR,
    ASSETS_DIR,
    TEMP_DIR,
    SESSION_DIR,
    dataFile
};
