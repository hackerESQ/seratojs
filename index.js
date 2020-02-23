const fs = require("fs");
const util = require("util");
const os = require("os");
const path = require("path");

// Singleton for Serato Folder Path (I doubt it'll change during runtime)
const SERATO_FOLDER = path.join(os.homedir(), "Music", "_Serato_");
const CRATES_FOLDER = path.join(SERATO_FOLDER, "SubCrates");

function listCratesSync(subcratesFolder = CRATES_FOLDER) {
  const crates = fs.readdirSync(subcratesFolder).map(x => {
    const name = path.basename(x, ".crate");
    return new Crate(name, subcratesFolder);
  });
  return crates;
}

async function listCrates(subcratesFolder) {
  const files = await util.promisify(fs.readdir)(subcratesFolder);
  const crates = files.map(x => {
    const name = path.basename(x, ".crate");
    return new Crate(name, subcratesFolder);
  });
  return crates;
}

const parse = function(contents) {
  // Find all 'ptrk' ocurrances
  const indices = [];
  for (let i = 0; i < contents.length; i++) {
    if (contents.slice(i, i + 4) === "ptrk") {
      indices.push(i);
    }
  }

  // Content in between these indices are the songs
  const songs = [];
  indices.forEach((value, index) => {
    const start = value + 9; // + 9 to skip the 'ptrk' itself and the bytes for size
    const isLast = index === indices.length - 1;
    const end = isLast ? contents.length : indices[index + 1] - 8; // -8 to remove 'otrk' and size bytes

    let filepath = contents.slice(start, end);
    filepath = filepath.replace(/\0/g, ""); // remove null-termination bytes
    songs.push(path.resolve("/", filepath));
  });
  return songs;
};

const toSeratoString = function(string) {
  return "\0" + string.split("").join("\0");
};

const intToHexbin = function(number) {
  const hex = number.toString(16).padStart(8, "0");
  let ret = "";
  for (let idx of [0, 2, 4, 6]) {
    let bytestr = hex.slice(idx, idx + 2);
    ret += String.fromCodePoint(parseInt(bytestr, 16));
  }
  return ret;
};

class Crate {
  constructor(name, subcratesFolder = CRATES_FOLDER) {
    // TODO: Make private
    this.filepath = path.join(subcratesFolder, name + ".crate");
    this.name = name;
    this.songPaths = null; // singleton to be lazy-populated
  }
  async getSongPaths() {
    if (this.songPaths === null) {
      const contents = await util.promisify(fs.readFile)(
        this.filepath,
        "ascii"
      );
      this.songPaths = parse(contents);
    }
    return Promise.resolve(this.songPaths);
  }
  getSongPathsSync() {
    if (this.songPaths === null) {
      this.songPaths = parse(fs.readFileSync(this.filepath, "ascii"));
    }
    return this.songPaths;
  }
  addSong(songPath) {
    if (this.songPaths === null) {
      this.songPaths = [];
    }

    const resolved = path.resolve(songPath);
    this.songPaths.push(resolved);
  }
  _buildSaveBuffer() {
    const header = "vrsn   8 1 . 0 / S e r a t o   S c r a t c h L i v e   C r a t e".replace(
      / /g,
      "\0"
    );

    let playlistSection = "";
    this.songPaths.forEach(value => {
      const data = toSeratoString(path.relative("/", value));
      let ptrkSize = intToHexbin(data.length);
      let otrkSize = intToHexbin(data.length + 8); // fixing the +8 (4 for 'ptrk', 4 for ptrkSize)
      playlistSection += "otrk" + otrkSize + "ptrk" + ptrkSize + data;
    });

    const contents = header + playlistSection;
    return Buffer.from(contents, "ascii");
  }
  async save() {
    const buffer = this._buildSaveBuffer();
    return util.promisify(fs.writeFile)(this.filepath, buffer, {
      encoding: null
    });
  }
  saveSync() {
    const buffer = this._buildSaveBuffer();
    fs.writeFileSync(this.filepath, buffer, { encoding: null });
  }
}

const seratojs = {
  Crate: Crate,
  listCratesSync: listCratesSync,
  listCrates: listCrates
};

module.exports = seratojs;
