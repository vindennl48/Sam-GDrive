const { Drive }     = require('./DriveAuth.js');
const { Client }    = require('../../samcore/src/Client.js');
const { Helpers }   = require('../../samcore/src/Helpers.js');

let nodeName   = 'gdrive';
let serverName = 'samcore';
let node       = new Client(nodeName, serverName/*, false*/);
let drive      = new Drive();

/**
  * Need to:
  * - merge Drive stuff into this file
  * - add some kind of init function to client nodes to check if certain nodes
  *   exist and do not run anything until those other nodes exist.
  */

node.run(function() {
  // drive.uploadFile(function(data) {
    // Helpers.log({leader: 'warning', loud: true}, 'Return: ', data.data);
  // });
  drive.listFolders(function(packet) {
    packet.data.files.forEach(folder => {
      if (folder.name == 'test') {
        drive.goto(folder.id);
      }
    });

    drive.listAll(function(packet) {
      Helpers.log({leader: 'arrow', loud: false}, 'stuff in test folder: ', packet.data.files);
    });
  });

});
