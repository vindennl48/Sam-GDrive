const { google }    = require('googleapis');
const { Drive }     = require('./DriveAuth.js');
const { Client }    = require('../../samcore/src/Client.js');
const { Helpers }   = require('../../samcore/src/Helpers.js');

let nodeName   = 'gdrive';
let serverName = 'samcore';
let node       = new Client(nodeName, serverName/*, false*/);
let drive      = new Drive();

node.run(function() {
  // drive.uploadFile(function(data) {
    // Helpers.log({leader: 'warning', loud: true}, 'Return: ', data.data);
  // });
  drive.listFiles(function(data) {
    Helpers.log({leader: 'warning', loud: true}, 'Return: ', data.data);
  });
});
