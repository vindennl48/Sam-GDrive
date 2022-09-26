/**
  * TODO: Integrate api calls for GUI file-explorers
  *
  * TODO: Upgrade the locking system to only download the lock file as many
  *       times as minimally necessary.
  */


// const fs          = require('fs').promises;
const { Drive }   = require('./DriveAuth.js');
const { Client }  = require('../../samcore/src/Client.js');
const { Helpers } = require('../../samcore/src/Helpers.js');

let nodeName   = 'gdrive';
let serverName = 'samcore';
let node       = new Client(nodeName, serverName);
let drive      = new Drive();

node
  /**
    * Used for making directory structure for new songs.  Should be done in
    * batch form.
    *
    * packet.data should be an array of song names to add directories for.
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
    if (await drive.lock()) {
      packet.bdata = packet.data;
      packet.data  = await drive.newSongs(packet.data);

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
    * To upload, format must be in:
    *   {
    *     parent:   '2039fh48fbi2kb4khsdifiwbef',
    *     type:     'mixes',                      // mixes, projects, stems
    *     filepath: './TravelSizedRanch.mp3',
    *     name:     'TravelSizedRanch.mp3',       // include the extension
    *   }
    * For updating remotedb.json
    *   {
    *     type:     'db',
    *     filepath: './remotedb.json',
    *     name:     'remotedb.json',              // include the extension
    *     id:       '2039fh48fbi2kb4khsdifiwbef', // id of remotedb on cloud
    *   }
    *
    * Returns either an object of new file id's or { errorMessage: 'message' }
    */
  .addApiCall('upload', async function(packet) {
    if (await drive.lock()) {
      let result = await drive.bulkUpload(packet.data);

      if ('errorMessage' in result) {
        this.returnError(packet, result.errorMessage);
        return;
      }

      packet.bdata = packet.data;
      packet.data  = result;

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
    * instruction example:
    *   {
    *     name:     'TravelSizedRanch.mp3',      // include the extension
    *     filepath: './TravelSizedRanch.mp3',
    *     id:       '2039fh48fbi2kb4khsdifiwbef'
    *   }
    *
    * Returns either { result: true } or { errorMessage: 'message' }
    */
  .addApiCall('download', async function(packet) {
    let result = await drive.bulkDownload(packet.data);

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
    onConnect: onConnect
  });

/**
  * Before we can start running the node, we need to get the username
  * and settings
  */
async function onInit() {
  let packet     = await this.callApi(serverName, 'getUsername');
  drive.username = packet.data;

  packet         = await this.callApi(serverName, 'getSettings');
  drive.settings = packet.data;
}

/**
  * Any code that needs to run when the node starts
  */
async function onConnect() {}
