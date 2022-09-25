const fs          = require('fs').promises;
const { Drive }   = require('./DriveAuth.js');
const { Client }  = require('../../samcore/src/Client.js');
const { Helpers } = require('../../samcore/src/Helpers.js');

let nodeName   = 'gdrive';
let serverName = 'samcore';
let node       = new Client(nodeName, serverName);
let drive      = new Drive();

node
  .addApiCall('onError', function(packet) {
    Helpers.log(
      {leader: 'error', loud: false},
      'Error: ', packet.errorMessage,
      ', Packet: ', packet
    );
  })

  .addApiCall('newsongs', async function(packet) {
    packet.bdata = packet.data;
    packet.data  = await drive.newSongs(packet.data);
    this.return(packet);
  })

  .addApiCall('upload', async function(packet) {
    let result = await drive.bulkUpload(packet.data);

    if ('errorMessage' in result) {
      this.returnError(packet, result.errorMessage);
      return;
    }

    packet.bdata = packet.data;
    packet.data  = result;
    this.return(packet);
  })

  .run({
    onInit:    onInit,
    onConnect: onConnect}
  );



async function onInit() {
  let packet     = await this.callApi(serverName, 'getUsername');
  drive.username = packet.data;

  packet         = await this.callApi(serverName, 'getSettings');
  drive.settings = packet.data;
}

async function onConnect() {
  let uploadPacket = [
    {
      parent:   drive.settings.songs,
      type:     'mixes',
      filepath: '/Users/mitch/Documents/LOFSongManager/extracted_songs/practice/Media/DrumMix(171).wav',
      name:     'DrumMix171.wav',
    },
    {
      parent:   drive.settings.songs,
      type:     'mixes',
      filepath: '/Users/mitch/Documents/LOFSongManager/extracted_songs/practice/Media/DrumMix(172).wav',
      name:     'DrumMix172.wav',
    },
    {
      parent:   drive.settings.songs,
      type:     'mixes',
      filepath: '/Users/mitch/Documents/LOFSongManager/extracted_songs/practice/Media/DrumMix(173).wav',
      name:     'DrumMix173.wav',
    }
  ];

  let packet = await this.callApi(nodeName, 'upload', uploadPacket);

  Helpers.log({leader: 'arrow', loud: false}, 'result: ', packet.data);
}



// lock: 1etR_CGZI6FFbsjVow4wklqBq_V82Q6FV




