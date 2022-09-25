const fs               = require('fs').promises;
const fss              = require('fs');
const path             = require('path');
const process          = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google }       = require('googleapis');
// const { Helpers }      = require('../../samcore/src/Helpers.js');

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

    this.lockfileName = '_lock.json';
    this.username     = 'default';
    this.settings     = {};

    this.currentPath  = ['root'];

    this.fileType = {
      json: 'application/json',
      mp3: 'audio/mpeg',
    }
  }

  async lock() {
    let canLock  = false;
    let lockfile = await this.getLockfile();

    if (lockfile.isLocked) {
      if (lockfile.username == this.username) {
        canLock = true;
      }
      else if (lockfile.timestamp+600000 < Date.now()) { // 10 min
        canLock = true;
      }
    } else {
      canLock = true;
    }

    if (canLock) {
      lockfile.isLocked = true;
      lockfile.username = this.username;
      lockfile.timestamp = Date.now();

      await fs.writeFile('./_lock.json', JSON.stringify(lockfile, null, 2));

      if (await this.setLockFile()) {
        return true;
      }
    }

    return false;
  }
  async unlock() {}

  async getLockfile() {
    // download new lock file first
    await this.downloadFile('./_lock.json', this.settings.lock);

    return JSON.parse(await fs.readFile('./_lock.json'));
  }

  async setLockFile() {
    return await this.updateFile('./_lock.json', this.settings.lock);
  }

  async downloadFile(filepath, id, args={}) {
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

  async updateFile(filepath, id) {
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

  async uploadFile(parent, fileType, filepath, name) {
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

  async fileInfo(id) {
    return await this._call(async function(drive) {
      let res = await drive.files.get({
        fileId: id,
        fields: 'id, name, size, mimeType, parents, webContentLink, webViewLink'
      });
      return res.data;
    }.bind(this));
  }

  async listFolders() {
    return await this._call(async function(drive) {
      const currentFolder = this.currentFolder;

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

  async _call(callback) {
    let promise = await new Promise(function(resolve, reject) {
      this._authorize().then(async function(authClient) {
        const drive = google.drive({version: 'v3', auth: authClient});
        resolve(callback(drive));
      });
    }.bind(this));
    return promise;
  }

////////////////////////////////////////////////////////////////////////////////

  get currentFolder() {
    return this.currentPath[this.currentPath.length-1];
  }

  /**
  * @param {string} newFolder
  *   This should be the id of the folder you wish to navigate into. If set as
  *   'root', it will go back to the root directory and erase all other
  *   folders in the list
  */
  goto(newFolder) {
    if (newFolder == 'root') {
      this.currentPath = ['root'];
      return;
    }

    this.currentPath.push(newFolder);

    // split filepath
    // if first part is a period then reference current directory
    // else start from root and navigate to specific directory
    // return the authClient for the next operation or run the callback
  }

//  uploadFile(callback) {
//    this._authorize().then(async function(authClient) {
//      const drive = google.drive({version: 'v3', auth: authClient});
//      const res = await drive.files.create({
//        requestBody: {
//            "name": "swift.mp3",
//        },
//        media: {
//          mimeType: 'audio/mpeg',
//          body: fss.createReadStream('./swift.mp3'),
//        },
//        fields: 'id'
//      });
//
//      callback(res);
//    });
//  }

  listFiles(callback) { this._list('files', callback); }

  // listFolders(callback) { this._list('folders', callback); }

  listAll(callback) { this._list('all', callback); }

  _list(type, callback=function(a){}) {
    const currentFolder = this.currentFolder;
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
