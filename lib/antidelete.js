/*****************************************************************************
 *  REDXBOT - lib/antidelete.js
 *  Bridge: re-exports the antidelete plugin so index.js can find it at
 *  require('./lib/antidelete').  The actual implementation lives in
 *  plugins/antidelete.js — this file just forwards everything.
 *****************************************************************************/

const antidelete = require('../plugins/antidelete');
module.exports = antidelete;
