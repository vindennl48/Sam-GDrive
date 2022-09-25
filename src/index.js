const fs          = require('fs').promises;
const { Drive }   = require('./DriveAuth.js');
const { Client }  = require('../../samcore/src/Client.js');
const { Helpers } = require('../../samcore/src/Helpers.js');

let nodeName   = 'gdrive';
let serverName = 'samcore';
let node       = new Client(nodeName, serverName);
let drive      = new Drive();

node.addApiCall('onError', function(packet) {
  Helpers.log(
    {leader: 'error', loud: false},
    'Error: ', packet.errorMessage,
    ', Packet: ', packet
  );
});

let main = async function() {
  node.run({onInit: onInit, onConnect: onConnect});
}
main();

async function onInit() {
  let packet     = await this.callApi(serverName, 'getUsername');
  drive.username = packet.data;

  packet         = await this.callApi(serverName, 'getSettings');
  drive.settings = packet.data;
}

const editJsonFile = require('edit-json-file');

async function onConnect() {
  // await drive.updateFile('./_lock.json', drive.settings.lock);
  let res = await drive.lock();
  Helpers.log({leader: 'arrow', loud: false}, 'result: ', res);
}



// lock: 1etR_CGZI6FFbsjVow4wklqBq_V82Q6FV




