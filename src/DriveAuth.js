const fs               = require('fs').promises;
const fss              = require('fs');
const path             = require('path');
const process          = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google }       = require('googleapis');
const { Helpers }      = require('../../samcore/src/Helpers.js');

class Drive {
  constructor() {
    // If modifying these scopes, delete token.json.
    this.SCOPES = ['https://www.googleapis.com/auth/drive'];
    // this.SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];

    // The file token.json stores the user's access and refresh tokens, and is
    // created automatically when the authorization flow completes for the first
    // time.
    this.TOKEN_PATH       = path.join(process.cwd(), 'gdrive_token.json');
    this.CREDENTIALS_PATH = path.join(process.cwd(), 'gdrive_credentials.json');

    this.fileType = {
      json:   'application/json',
      mp3:    'audio/mpeg',
      folder: 'application/vnd.google-apps.folder',
      zip:    'application/x-gzip'
    }

    this.localLockfile  = 'local_lock.json';
    this.remoteLockfile = 'remote_lock.json';
    this.ramLock           = null;

    this.username = 'default';
    this.settings = {};

    this.currentPath = ['root'];
  }

  /**
    * Used for mass uploading of files.
    * TODO: There should be a way to make this all asyncronous to upload all
    *       files at the same time..  Just need a way to have them all come
    *       together at the end so we can return once everything is complete.
    *
    * @param {array} instructions
    *   List of instructions for what files to upload and to where.
    *   instruction example:
    *     {
    *       parent: '2039fh48fbi2kb4khsdifiwbef',
    *       type: 'mixes',  // mixes, projects, stems
    *       filepath: './TravelSizedRanch.mp3',
    *       name: 'TravelSizedRanch.mp3', // include the extension
    *     }
    *
    */
  async bulkUpload(instructions) {
    let result = {};

    for (let i = 0; i < instructions.length; i++) {
      const instruction = instructions[i];

      if ( !('parent' in instruction) ||
          !('type' in instruction) ||
          !('filepath' in instruction) ||
          !('name' in instruction) ) {
        return {
          errorMessage: `Missing variable in instruction #${i}`
        };
      }

      let type = null;
      if      (instruction.type == 'mixes')    { type = this.fileType.mp3; }
      else if (instruction.type == 'projects') { type = this.fileType.zip; }
      else if (instruction.type == 'stems')    { type = this.fileType.zip; }
      else {
        return {
          errorMessage: `Invalid type in instruction #${i}`
        };
      }

      Helpers.log({leader: 'arrow', loud: false},
        `Uploading '${instruction.name}'..`
      );
      result[instruction.name] = await this._uploadFile(
        instruction.parent,
        type,
        instruction.filepath,
        instruction.name,
        {
          'data': async function(percent) {
            Helpers.log({leader: 'sub', loud: false},
              `'${instruction.name}' uploaded: `, percent
            );
          },
          'end': async function() {
            Helpers.log({leader: 'sub', loud: false},
              `'${instruction.name}' Upload Complete!`
            );
          },
          'error': async function(err) {
            Helpers.log({leader: 'error', loud: false},
              `'${instruction.name}' Upload Error: `, err
            );
          }
        }
      );
    }

    Helpers.log({leader: 'highlight', loud: false}, 'Uploads Complete!');

    return result;
  }


  /**
    * Used for creating the directory structure on the cloud required to upload
    * audio and proejct files.
    *
    * @param {array} names
    *   This should be the list of new songs to create directory structures for
    *
    * @return {object}
    *   Returns an object of the folder ID's associated with the newly created
    *   directory structure.
    *   example:
    *     {
    *       newsong: {
    *         root: '2938f-2893urf0r4u0refg',
    *         mixes: '2938f-2893urf0r4u0refg',
    *         projects: '2938f-2893urf0r4u0refg',
    *         stems: '2938f-2893urf0r4u0refg'
    *       }
    *     }
    */
  async newSongs(names) {
    if (!Array.isArray(names)) {
      names = [names];
    }

    let result = {}

    for (let i = 0; i < names.length; i++) {
      const name = names[i];

      result[name]          = {};
      result[name].root     = await this._makeFolder(this.settings.songs, name);
      result[name].mixes    = await this._makeFolder(result[name].root, 'mixes');
      result[name].projects = await this._makeFolder(result[name].root, 'projects');
      result[name].stems    = await this._makeFolder(result[name].root, 'stems');
    }

    return result;
  }

  /**
    * Used for locking the drive from uploading if someone else is uploading.
    * This works on a 10 minute timer. In case an unlock is skipped, when 10
    * minutes has elapsed from the last lock, anyone can re-lock the drive.
    *
    * @return {bool}
    *   Returns a boolean if we successfully locked the drive
    */
  async _lock() {
    let canLock  = false;
    this.ramLock = await this._getLockfile();

    if (this.ramLock.isLocked) {
      if (this.ramLock.username == this.username) {
        canLock = true;
      }
      else if (this.ramLock.timestamp+600000 < Date.now()) { // 10 min
        canLock = true;
      }
    } else {
      canLock = true;
    }

    if (canLock === true) {
      this.ramLock.isLocked = true;
      this.ramLock.username = this.username;
      this.ramLock.timestamp = Date.now();

      await fs.writeFile(this.localLockfile, JSON.stringify(this.ramLock, null, 2));

      if (await this._setLockFile()) {
        return true;
      }
    }

    // remove lock in ram
    this.ramLock = null;

    return false;
  }

  /**
    * Used for unlocking the drive if we have locked it
    *
    * @return {bool}
    *   Returns a boolean if we successfully unlocked the drive
    */
  async _unlock() {
    let canUnlock = false;
    this.ramLock  = await this._getLockfile();

    if (this.ramLock.isLocked) {
      if (this.ramLock.username == this.username) {
        canUnlock = true;
      }
      else if (this.ramLock.timestamp+600000 < Date.now()) { // 10 min
        canUnlock = true;
      }
    } else {
      // already unlocked
      return true;
    }

    if (canUnlock) {
      this.ramLock.isLocked = false;
      await fs.writeFile(this.localLockfile, JSON.stringify(this.ramLock, null, 2));

      if (await this._setLockFile()) {
        return true;
      }
    }

    return false;
  }

  /**
    * Used for getting the lockfile from the cloud.
    *
    * @return {object}
    *   Returns an object of the downloaded lock file
    */
  async _getLockfile() {
    // download new lock file first
    if (this.ramLock == null) {
      await this._downloadFile(this.remoteLockfile, this.settings.lock);
    }

    return JSON.parse(await fs.readFile(this.remoteLockfile));
  }

  /**
    * Used for uploading a new lock file.  This should only be used inside the
    * 'this._lock()' function to be checked for authenticity first.
    *
    * @return {bool}
    *   Returns a boolean if we uploaded the new lock successfully
    */
  async _setLockFile() {
    // Push new lock file to the drive
    let ret = await this._updateFile(this.localLockfile, this.settings.lock);

    // remove lock in ram
    // if (ret === true) {
    //   this.ramLock = null;
    // }

    return ret;
  }

  /**
    * Used for downloading a file from the drive
    *
    * @param {string} filepath
    *   The location of the file you want to upload
    * @param {string} id
    *   The google file id of the file you want to overwrite.
    * @param {object} args
    *   This object contains the following options:
    *   'end': function() - ran at end of upload
    *   'error': function(err) - ran during error of upload
    *   'data': function(percentage) - ran during upload. 'percentage' is 0-100%
    *
    * @return {bool}
    *   Returns a boolean if successful
    */
  async _downloadFile(filepath, id, args={}) {
    return await this._call(async function(drive) {
      let size = 0;
      if ('data' in args) {
        size = (await drive.files.get(
          {fileId: id, fields: 'size'}
        )).data.size
      }

      let download = await drive.files.get(
        {fileId: id, alt: 'media', q: 'acknowledgeAbuse=true'},
        {responseType: 'stream'}
      )

      let result = await new Promise(function(resolve, reject) {
        let progress = 0;

        download.data
          .on('end', function() {
            if ('end' in args) { args.end(); }
            resolve(true);
          })
          .on('error', function(err) {
            if ('error' in args) { args.error(err); }
            reject(err);
          })
          .on('data', function(data) {
            if ('data' in args) {
              progress += data.length;
              let percent = (progress/size)*100;
              args.data(percent);
            }
          })
          .pipe(fss.createWriteStream(filepath));
      });

      return result;
    }.bind(this));
  }

  /**
    * Used for updating a specific file. If you want to upload a new file,
    * please use 'this._uploadFile'.
    *
    * NOTE: Lock should be checked before using this function.
    *
    * @param {string} filepath
    *   The location of the file you want to upload
    * @param {string} id
    *   The google file id of the file you want to overwrite.
    *
    * @return {bool}
    *   Returns a boolean if we were successful.
    */
  async _updateFile(filepath, id) {
    return await this._call(async function(drive) {
      const res = await drive.files.update({
        fileId: id,
        media: {
          body: fss.createReadStream(filepath),
        },
        fields: 'id'
      });

      if (res.data.id == id) {
        return true;
      }
      return false;
    }.bind(this));
  }

  /**
    * Used for uploading a file to the drive.
    *
    * NOTE: Lock should be checked before using this function.
    *
    * @param {string} parent
    *   This is the google id of the folder you want to upload into
    * @param {string} fileType
    *   This is the mimeType associated with the uploading file.  To get a list
    *   of possible mimeTypes, use 'this.fileType'.
    * @param {string} filepath
    *   The location of the file you want to upload
    * @param {string} name
    *   The name you would like associated with the file when uploaded.
    *
    * @return {Promise<string>}
    *   Returns the google file id of the uploaded file.
    */
  async _uploadFile(parent, fileType, filepath, name) {
    return await this._call(async function(drive) {
      const res = await drive.files.create({
        requestBody: {
          name:    name,
          parents: [parent],
        },
        media: {
          mimeType: fileType,
          body:     fss.createReadStream(filepath),
        },
        fields: 'id'
      });

      return res.data.id;
    }.bind(this));
  }

  //    for reference
//    def mkdir(name="Untitled", parent=None):
//        # Create folder inside parent directory
//        # This returns the newly created folder ID
//
//        # If no parent is specified, use the project root_id
//        if not parent:
//            parent = Drive.root_id
//
//        # Check to make sure file doesn't already exist
//        dir_id = Drive.get_id(name, parent)
//        if dir_id:
//            return dir_id
//
//        return Drive.service.files().create(body={
//            "name":     name,
//            "mimeType": Drive.mimeType["folder"],
//            "parents":  [ parent ],
//        }).execute()["id"]

  async _makeFolder(parent='root', name) {
    return await this._call(async function(drive) {
      const res = await drive.files.create({
        requestBody: {
          name:    name,
          parents: [parent],
          mimeType: this.fileType.folder
        },
        fields: 'id'
      });

      return res.data.id;
    }.bind(this));
  }

  /**
    * Used for getting info about a file.
    *
    * @param {string} id
    *   This is the google file id that you want to get info on.
    *
    * @return {object}
    *   Returns an object of desired fields listed below in 'fields'
    */
  async _fileInfo(id) {
    return await this._call(async function(drive) {
      let res = await drive.files.get({
        fileId: id,
        fields: 'id, name, size, mimeType, parents, webContentLink, webViewLink'
      });
      return res.data;
    }.bind(this));
  }

  /**
    * Used for listing folders in the current directory.
    * TODO: Need to update this function
    */
  async _listFolders() {
    return await this._call(async function(drive) {
      const currentFolder = this._currentFolder;

      let search = `\'${currentFolder}\' in parents and trashed=False`;
      search += ' and mimeType=\'application/vnd.google-apps.folder\''

      const res = await drive.files.list({
        // fields: '*', // use for adding fields
        // parents: ['1yG01ZqucJ8oFKhT7ecZRko1BhNp2NE6H'],
        fields: 'files(id, name, mimeType, parents, webContentLink, webViewLink)',
        orderBy: 'name',
        q: search,
        //result = Drive.service.files()._list(q=f'"{search}" in parents and trashed=False').execute().get("files", [])
      });

      return res.data.files;
    }.bind(this));
  }

  /**
    * Used for authenticating with Google before being able to run any drive api
    * commands.
    *
    * @param {function} callback
    *   This callback is the drive commands you would like to run while
    *   authenticated.
    *
    * @return {all}
    *   Anything returned from the callback will get returned from this function
    */
  async _call(callback) {
    let promise = await new Promise(function(resolve, reject) {
      this._authorize().then(async function(authClient) {
        const drive = google.drive({version: 'v3', auth: authClient});
        resolve(callback(drive));
      });
    }.bind(this));
    return promise;
  }

  /**
    * Used for getting the last folder in the 'this.currentPath' variable
    */
  get _currentFolder() {
    return this.currentPath[this.currentPath.length-1];
  }

  /**
    * Used for going to a new parent folder
    *
    * @param {string} newFolderId
    *   This should be the id of the folder you wish to navigate into. If set as
    *   'root', it will go back to the root directory and erase all other
    *   folders in the list
    */
  _goto(newFolderId) {
    if (newFolderId == 'root') {
      this.currentPath = ['root'];
      return;
    }

    this.currentPath.push(newFolderId);
  }

  /**
    * Legacy function to list files or folders
    */
  _list_old(type, callback=function(a){}) {
    const currentFolder = this._currentFolder;
    this._authorize().then(async function(authClient) {
      const drive = google.drive({version: 'v3', auth: authClient});

      let search = `\'${currentFolder}\' in parents and trashed=False`;
      
      if (type == 'folders') {
        search += ' and mimeType=\'application/vnd.google-apps.folder\''
      } else if (type == 'files'){
        search += ' and mimeType!=\'application/vnd.google-apps.folder\''
      }
      // else show all files and folders

      const res = await drive.files.list({
        // fields: '*', // use for adding fields
        // parents: ['1yG01ZqucJ8oFKhT7ecZRko1BhNp2NE6H'],
        fields: 'files(id, name, mimeType, parents, webContentLink, webViewLink)',
        orderBy: 'name',
        q: search,
//result = Drive.service.files()._list(q=f'"{search}" in parents and trashed=False').execute().get("files", [])
      });
      callback(res.data.files);
//      const files = res.data.files;
//      if (files.length === 0) {
//        console.log('No files found.');
//        return;
//      }
//
//      console.log('Files:');
//      files.map((file) => {
//        console.log(`${file.name} (${file.id})`);
//      });
//
//      callback(4);
    });
  }

  /**
    * Reads previously authorized credentials from the save file.
    *
    * @return {Promise<OAuth2Client|null>}
    */
  async _loadSavedCredentialsIfExist() {
    try {
      const content = await fs.readFile(this.TOKEN_PATH);
      const credentials = JSON.parse(content);
      return google.auth.fromJSON(credentials);
    } catch (err) {
      return null;
    }
  }


  /**
    * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
    *
    * @param {OAuth2Client} client
    * @return {Promise<void>}
    */
  async _saveCredentials(client) {
    const content = await fs.readFile(this.CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
      type: 'authorized_user',
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(this.TOKEN_PATH, payload);
  }


  /**
    * Load or request or authorization to call APIs.
    *
    */
  async _authorize() {
    let client = await this._loadSavedCredentialsIfExist();
    if (client) {
      return client;
    }
    client = await authenticate({
      scopes: this.SCOPES,
      keyfilePath: this.CREDENTIALS_PATH,
    });
    if (client.credentials) {
      await this._saveCredentials(client);
    }
    return client;
  }

  /**
    * TEST FUNCTION
    * Lists the names and IDs of up to 10 files.
    * @param {OAuth2Client} authClient An authorized OAuth2 client.
    */
  async listFilesTest(authClient) {
    const drive = google.drive({version: 'v3', auth: authClient});
    const res = await drive.files.list({
      pageSize: 10,
      fields: 'nextPageToken, files(id, name)',
    });
    const files = res.data.files;
    if (files.length === 0) {
      console.log('No files found.');
      return;
    }

    console.log('Files:');
    files.map((file) => {
      console.log(`${file.name} (${file.id})`);
    });
  }
}

module.exports = { Drive };




/*
  ::Full list of upload properties::

const res = await drive.files.create({
  requestBody: {
    //   "appProperties": {},
    //   "capabilities": {},
    //   "contentHints": {},
    //   "contentRestrictions": [],
    //   "copyRequiresWriterPermission": false,
    //   "createdTime": "my_createdTime",
    //   "description": "my_description",
    //   "driveId": "my_driveId",
    //   "explicitlyTrashed": false,
    //   "exportLinks": {},
    //   "fileExtension": "my_fileExtension",
    //   "folderColorRgb": "my_folderColorRgb",
    //   "fullFileExtension": "my_fullFileExtension",
    //   "hasAugmentedPermissions": false,
    //   "hasThumbnail": false,
    //   "headRevisionId": "my_headRevisionId",
    //   "iconLink": "my_iconLink",
    //   "id": "my_id",
    //   "imageMediaMetadata": {},
    //   "isAppAuthorized": false,
    //   "kind": "my_kind",
    //   "labelInfo": {},
    //   "lastModifyingUser": {},
    //   "linkShareMetadata": {},
    //   "md5Checksum": "my_md5Checksum",
    //   "mimeType": "my_mimeType",
    //   "modifiedByMe": false,
    //   "modifiedByMeTime": "my_modifiedByMeTime",
    //   "modifiedTime": "my_modifiedTime",
      "name": "swift.mp3",
    //   "originalFilename": "my_originalFilename",
    //   "ownedByMe": false,
    //   "owners": [],
    //   "parents": [],
    //   "permissionIds": [],
    //   "permissions": [],
    //   "properties": {},
    //   "quotaBytesUsed": "my_quotaBytesUsed",
    //   "resourceKey": "my_resourceKey",
    //   "sha1Checksum": "my_sha1Checksum",
    //   "sha256Checksum": "my_sha256Checksum",
    //   "shared": false,
    //   "sharedWithMeTime": "my_sharedWithMeTime",
    //   "sharingUser": {},
    //   "shortcutDetails": {},
    //   "size": "my_size",
    //   "spaces": [],
    //   "starred": false,
    //   "teamDriveId": "my_teamDriveId",
    //   "thumbnailLink": "my_thumbnailLink",
    //   "thumbnailVersion": "my_thumbnailVersion",
    //   "trashed": false,
    //   "trashedTime": "my_trashedTime",
    //   "trashingUser": {},
    //   "version": "my_version",
    //   "videoMediaMetadata": {},
    //   "viewedByMe": false,
    //   "viewedByMeTime": "my_viewedByMeTime",
    //   "viewersCanCopyContent": false,
    //   "webContentLink": "my_webContentLink",
    //   "webViewLink": "my_webViewLink",
    //   "writersCanShare": false
  },
  media: {
    mimeType: 'audio/mpeg',
    body: fss.createReadStream('./swift.mp3'),
  },
  fields: 'id'
});

*/
