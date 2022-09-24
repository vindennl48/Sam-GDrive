const fs               = require('fs').promises;
const fss              = require('fs');
const path             = require('path');
const process          = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google }       = require('googleapis');

class Drive {
  constructor() {
    // If modifying these scopes, delete token.json.
    this.SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];
    // The file token.json stores the user's access and refresh tokens, and is
    // created automatically when the authorization flow completes for the first
    // time.
    this.TOKEN_PATH = path.join(process.cwd(), 'token.json');
    this.CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

    this.currentPath = ['root'];
  }

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

  uploadFile(callback) {
    this._authorize().then(async function(authClient) {
      const drive = google.drive({version: 'v3', auth: authClient});
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

      callback(res);
    });
  }

  listFiles(callback) { this._list('files', callback); }

  listFolders(callback) { this._list('folders', callback); }

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
      callback(res);
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
