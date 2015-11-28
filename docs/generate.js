"use strict";

var jsdoc2md = require("jsdoc-to-markdown");
var fs = require('fs');
var replaceStream = require('replacestream');

// Copy the base README.md
fs.writeFileSync('./README.md', fs.readFileSync('./docs/README.part.md'));

// Pipe the JSDoc output to the end of the file.
jsdoc2md({ src: "lib/*.js" })
    .pipe(replaceStream("\\/", "/"))
    .pipe(fs.createWriteStream('./README.md', { flags: 'a' }));
