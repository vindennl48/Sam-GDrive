/**
  * TODO: Integrate api calls for GUI file-explorers
  *
  * TODO: Upgrade the locking system to only download the lock file as many
  *       times as minimally necessary.
  */


const { Drive }   = require('./DriveAuth.js');
const { Client }  = require('../../samcore/src/Client.js');
const { Helpers } = require('../../samcore/src/Helpers.js');
const Packet      = Helpers.Packet;

let nodeName   = 'gdrive';
let serverName = 'samcore';
let node       = new Client(nodeName, serverName);
let drive      = new Drive();

node
  /**
    * Used for making directory structure for new songs.  Should be done in
    * batch form.
    *
    * packet.args {
    *   names: ['name 1', 'name 2', ...]
    * }
    *
    * The return will be:
    *   {
    *     songname: {
    *       mixes:    '3uf328fh48hf92h83f93h',
    *       stems:    '3uf328fh48hf92h83f93h',
    *       projects: '3uf328fh48hf92h83f93h'
    *     }
    *   }
    */
  .addApiCall('newSongs', async function(packet) {
    // Check if proper arguments are in the packet
    if (!Packet.checkArgs(this, ['names'], packet)) return;

    if (await drive.lock()) {
      packet = Packet.mergeMini(packet, await drive.newSongs(packet.args.names));
      // packet.data = { result: await drive.newSongs(packet.data) }

      if (await drive.unlock()) {
        this.return(packet);
      } else {
        this.returnError(packet, 'There was an error unlocking the drive..');
      }

      return;
    }

    this.returnError(
      packet,
      'There was an error locking the drive.. Please wait 10 minutes and try again.'
    );
  })

  /**
    * Used for bulk uploading of files. Can be used for mixes, stems, projects,
    * and the remotedb.json file.
    *
    * packet.args {
    *   files: [
    *     { // To upload, format must be in:
    *       parent:   '2039fh48fbi2kb4khsdifiwbef',
    *       type:     'mixes',                      // mixes, projects, stems
    *       filepath: './TravelSizedRanch.mp3',
    *       name:     'TravelSizedRanch.mp3',       // include the extension
    *     },
    *     { // For updating remotedb.json
    *       type:     'db',
    *       filepath: './remotedb.json',
    *       name:     'remotedb.json',              // include the extension
    *       id:       '2039fh48fbi2kb4khsdifiwbef', // id of remotedb on cloud
    *     }
    *   ]
    * }
    *
    * Returns an object of new file id's
    */
  .addApiCall('upload', async function(packet) {
    // Check if proper arguments are in the packet
    if (!Packet.checkArgs(this, ['files'], packet)) return;

    if (await drive.lock()) {
      packet = Packet.mergeMini(packet, await drive.bulkUpload(packet.args.files));
      // let result = await drive.bulkUpload(packet.args.files);

      // if ('errorMessage' in result) {
      //   this.returnError(packet, result.errorMessage);
      //   return;
      // }

      // packet.data = { result: result };

      if (await drive.unlock()) {
        this.return(packet);
      } else {
        this.returnError(packet, 'There was an error unlocking the drive..');
      }

      return;
    }

    this.returnError(
      packet,
      'There was an error locking the drive.. Please wait 10 minutes and try again.'
    );
  })

  /**
    * Used for downloading multiple files at a time.
    *
    * packet.args = {
    *   files: [
    *     {
    *       name:     'TravelSizedRanch.mp3',      // include the extension
    *       filepath: './TravelSizedRanch.mp3',
    *       id:       '2039fh48fbi2kb4khsdifiwbef'
    *     }
    *   ]
    * }
    *
    * Returns either status true or an error message
    */
  .addApiCall('download', async function(packet) {
    // Check if proper arguments are in the packet
    if (!Packet.checkArgs(this, ['files'], packet)) return;

    packet = Packet.mergeMini(packet, await drive.bulkDownload(packet.args.files));
    // let result = await drive.bulkDownload(packet.args.files);

    // if ('errorMessage' in result) {
    //   this.returnError(packet, result.errorMessage);
    //   return;
    // }

    // packet.data = { result: result };

    this.return(packet);
  })

  .run({
    onInit:    onInit,
    onConnect: onConnect
  });

/**
  * Before we can start running the node, we need to get the username
  * and settings
  */
async function onInit() {
  // load username from samcore
  let packet = await this.callApi(serverName, 'getUsername');
  if (packet.status) {
    drive.username = packet.result;
  } else {
    Helpers.log({leader: 'error', loud: false},
      'Error: ',
      packet.errorMessage
    );
  }

  // Load settings from samcore
  packet = await this.callApi(serverName, 'getSettings');
  if (packet.status) {
    drive.settings = packet.result;
  } else {
    Helpers.log({leader: 'error', loud: false},
      'Error: ',
      packet.errorMessage
    );
  }
}

/**
  * Any code that needs to run when the node starts
  */
async function onConnect() {
  Helpers.log({leader: 'arrow', loud: true}, 'Running!');
}
