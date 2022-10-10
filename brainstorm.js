/**
  * Song file upload directory structure
  * NOTE: we need to remove write access to this drive for all other users.
  *       This will prevent miscommunication between whats real and what is
  *       listed in the dbjson file.
  *
  * SongName
  * - mixes
  *   - 20220822-SongName.mp3
  *   - 20220906-SongName.mp3
  *   - 20220913-SongName.mp3
  * - stems
  *   - 20220822-SongName.zip
  *     - 20220822-James.mp3
  *     - 20220822-Jesse.mp3
  *     - 20220822-Mitch.mp3
  *     - 20220822-Sean.mp3
  *     - 20220822-Click.mp3
  *   - 20220906-SongName.zip
  *   - 20220913-SongName.zip
  * - projects
  *   - 20220717-StudioOne.zip
  *   - 20220913-Reaper.zip
  */

/**
  * Gdrive Commands
  */
uploadSong({
  // Required
  id: 'only if an id already exists for this song',
  name: 'only if no id exists for this song',
  // Optional
  mixes: {
    // When these get uploaded, need to prepend the date before upload.
    // - I think reaper might do this automagically but if we upload thru
    //   StudioOne, it won't.  Might need differing logic depending on the daw
    // - Each file uploaded will have it's own unique id#
    fileName: 'filepath to mix to upload',
    fileName: 'filepath to mix to upload'
  },
  stems: {
    // - do we want to compress these?
    // - make sure to export click track as well here
    // - Same here, prepend with date on all stems if it doesnt already exist
    // - Each file uploaded will have it's own unique id#
    recName: {stemName: 'filepath to stem 1', stemName: 'filepath to stem 2'},
    recName: {stemName: 'filepath to stem 1', stemName: 'filepath to stem 2'}
  },
  project: { // we will let gdrive node compress the project
    // - Each file uploaded will have it's own unique id#
    projectName: {
      daw: 'reaper',
      path: 'filepath to project file',
    }
  },
});

/**
  * change song name and settings
  */
updateSong({
  // Required
  id: 'id of the song requested',
  // Optional
  name: 'change name to this',
  rank: 'change rank to this',
  addTags: ['add tags to this list'],
  tags: ['remove current tags and replace with these'],
});


/**
  * Project directory setup
  *
  * SongName
  * - stems
  * - mixes
  * - 20220907-SongName
  *   - audio (reaper generated)
  *   - peaks (reaper generated)
  *   - mixes (will be included in the zip)
  *   - stems (will be included in the zip)
  * - 20220913-SongName
  *   - audio (reaper generated)
  *   - peaks (reaper generated)
  *   - mixes (will be included in the zip)
  *   - stems (will be included in the zip)
  */
downloadSong({
  // Required
  id: 'id of the song requested',
  // Optional
  mixes: {
    id: ['id of mix', 'id of mix'], // used mostly for frontends and such
    // OR
    name: ['name of mix', 'name of mix'], // might be useful?
    // OR
    n: 'number of mixes from newest to oldest', // used for first time download
  },
  stems: {
    id: ['id of stem zip', 'id of stem zip'], // used mostly for frontends and such
    // OR
    name: ['name of stem zip', 'name of stem zip'], // might be useful?
    // OR
    n: 'number of stem zips from newest to oldest', // used for first time download
  },
  projects: {
    // Required
    daw: 'reaper',  // or studioOne
    // Optional
    id: ['id of project', 'id of project'], // used mostly for frontends and such
    // OR
    name: ['name of project', 'name of project'], // might be useful?
    // OR
    n: 'number of projects from newest to oldest', // used for first time download
  },
});
