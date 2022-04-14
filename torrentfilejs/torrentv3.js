const utils = require("./utils");
const Path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { benWrite } = require("./jsben");
const { Buffer } = require("buffer");

const BLOCKSIZE = 2 ** 14;
const HASHSIZE = 32;

class TorrentV3 {
  constructor(
    path = "",
    announce = [],
    comment = undefined,
    piecelength = undefined,
    privat = undefined,
    outfile = undefined,
    source = undefined,
    webseed = undefined
  ) {
    this.meta = new Map();
    this.info = new Map();
    if (announce.length > 0) {
      this.meta.set("announce", announce[0]);
      this.meta.set("announce-list", [announce]);
    } else {
      this.meta.set("announce", "");
      this.meta.set("announce-list", [[""]]);
    }
    if (comment) {
      this.info.set("comment", comment);
    }
    if (webseed) this.meta.set("url-list", webseed);
    if (source) this.info.set("source", source);
    if (privat) this.info.set("private", 1);
    if (piecelength)
      this.info.set("piece length", utils.normalizePieceLength(piecelength));
    else this.info.set("piece length", utils.getPieceLength(path));
    this.outfile = outfile;
    this.meta.set("created by", "torrentfilejs");
    this.path = path;
    this.name = Path.basename(Path.resolve(this.path));
    this.info.set("name", this.name);
    this.meta.set("info", this.info);
    this.pieceLayers = new Map();
    this.files = [];
    this.pieces = [];
    this.hashes = [];
  }

  assemble() {
    let info = this.info;
    info.set("meta version", 2);
    if (utils.isfile(this.path)) {
      info.set("length", size);
      var fileTree = new Map();
      fileTree.set(info.get("name"), this._traverse(this.path));
      info.set("file tree", fileTree);
    } else {
      info.set("file tree", this._traverse(this.path));
      info.set("files", this.files);
    }
    this.meta.set("piece layers", this.pieceLayers);
    info.set("pieces", utils.bufJoin(this.pieces));
    this.info = info;
    this.meta.set("info", this.info);
  }

  _traverse(path) {
    if (utils.isfile(path)) {
      let size = utils.getsize(path);
      let parts = [
        ["length", size],
        ["path", utils.pathparts(this.path, path)],
      ];
      this.files.push(new Map(parts));
      if (size == 0) {
        return new Map([["", new Map([["length", size]])]]);
      }
      let fhash = new Hasher(path, this.info.get("piece length"));
      if (size > this.info.get("piece length")) {
        this.pieceLayers.set(fhash.root, fhash.pieceLayer);
      }
      this.hashes.push(fhash);
      this.pieces.push(utils.bufJoin(fhash.pieces));
      if (fhash.paddingFile) {
        this.files.push(fhash.paddingFile);
      }
      let inner = [
        ["length", size],
        ["pieces root", fhash.root],
      ];
      return new Map([["", new Map(inner)]]);
    } else {
      let fileTree = new Map();
      if (utils.isdir(path)) {
        for (let fd of fs.readdirSync(path)) {
          const fpath = Path.resolve(path, fd);
          fileTree.set(fd, this._traverse(fpath));
        }
      }
      return fileTree;
    }
  }
  sortMeta() {
    let info = this.meta.get("info");
    info = new Map([...map].sort());
    this.meta.set("info", info);
    meta = new Map([...this.meta].sort());
    this.meta = meta;
    return meta;
  }
  write() {
    var path = this.path + ".torrent";
    this.sortMeta();
    benWrite(this.meta, path);
  }
}

function merkleRoot(blocks) {
  if (blocks.length > 0){
    while (blocks.length > 1) {
      let arr = [];
      while (blocks.length > 1) {
        let block1 = blocks.shift();
        let block2 = blocks.shift();
        let block = Buffer.concat(
          [block1, block2],
          block1.length + block2.length
        );
        var shasum = crypto.createHash("sha256");
        shasum.update(block);
        block = shasum.digest();
        arr.push(block);
      }
      blocks = arr;
    }
    return blocks[0];
  }
  return null;
}

class Hasher {
  constructor(file, pieceLength) {
    this.pieceLength = pieceLength;
    this.root = null;
    this.pieces = [];
    this.paddingPiece = null;
    this.paddingFile = null;
    this.pieceLayer = null;
    this.layerHashes = [];
    this.total = utils.getsize(file);
    this.num_blocks = Math.floor(pieceLength / BLOCKSIZE);
    let current = fs.openSync(file);
    this.processFile(current);
  }

  processFile(fd) {
    while (1) {
      let blocks = [];
      let plength = this.pieceLength;
      let leaf = Buffer.alloc(BLOCKSIZE);
      let piece = crypto.createHash("sha1");
      for (let i = 0; i < this.num_blocks; i++) {
        var consumed = fs.readSync(fd, leaf, 0, BLOCKSIZE, null);
        this.total -= consumed;
        if (!consumed) break;
        if (consumed < BLOCKSIZE) {
          leaf = leaf.subarray(0, consumed);
        }
        plength -= consumed;
        blocks.push(this.hash(leaf));
        piece.update(leaf);
      }
      if (blocks.length == 0) {
        break;
      }
      if (blocks.length != this.numBlocks) {
        let remainder = this.numBlocks - blocks.length;
        if (this.layerHashes.length == 0) {
          let p2 = utils.nextPow2(blocks.length);
          remainder = p2 - blocks.length;
        }
        for (let j = 0; j < remainder; j++) {
          let padding = Buffer.alloc(HASHSIZE);
          blocks.push(padding);
        }
      }
      let layerHash = merkleRoot(blocks);
      this.layerHashes.push(layerHash);
      if (plength > 0) {
        this.paddingFile = new Map();
        this.paddingFile.set("attr", "p");
        this.paddingFile.set("length", this.total);
        this.paddingFile.set("path", [".pad", plength.toString()]);
        piece.update(Buffer.alloc(plength));
      }
      this.pieces.push(piece.digest());
    }
    this._calcRoot();
  }

  hash(buffer) {
    var shasum = crypto.createHash("sha256");
    shasum.update(buffer);
    return shasum.digest();
  }

  _calcRoot() {
    let size = 0;
    for (let hash of this.layerHashes) {
      size += hash.length;
    }
    this.pieceLayer = Buffer.concat(this.layerHashes, size);
    let hashes = this.layerHashes.length;
    if (hashes > 1) {
      let p2 = utils.nextPow2(hashes);
      let remainder = p2 - hashes;
      let arr = [];
      for (let i = 0; i < this.num_blocks; i++) {
        let padding = Buffer.alloc(HASHSIZE);
        arr.push(padding);
      }
      for (let j = 0; j < remainder; j++) {
        this.layerHashes.push(merkleRoot(arr));
      }
    }
    this.root = merkleRoot(this.layerHashes);
  }
}

module.exports = { TorrentV3 };